import {
  createWorkbook,
  createWorkbookRevision,
  findWorkbook,
  findWorkbookRevision,
  type SpreadsheetRepositories,
} from "@gridline/spreadsheet-application";
import {
  createBrowserRepositories,
} from "@gridline/sqlite-workbook-repository";
import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellId,
  cellIdParts,
  dependentsOf,
  formatA1Address,
  formatCellValue,
  parseA1Address,
  parseCellInput,
  recalculate,
  revisionNumber,
  workbookChangeSet,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
  type CalculationSnapshot,
  type CellContent,
  type CellId,
  type CellValue,
  type FormulaToken as EngineFormulaToken,
} from "@gridline/spreadsheet-engine";

import type {
  CalculationInspection,
  CellInput,
  CellView,
  FormulaToken,
  SpreadsheetClient,
  SpreadsheetValue,
  WorkbookView,
} from "@/spreadsheet/contracts";

const workbookIdentifier = workbookId("gridline-formula-lab");
const worksheetIdentifier = worksheetId("gridline-sheet-1");
const worksheet = new Worksheet({
  id: worksheetIdentifier,
  name: worksheetName("Sheet1"),
});

const demoInputs: Readonly<Record<string, string>> = {
  A1: "Gridline — formula laboratory",
  A3: "Revenue",
  B3: "Cost",
  C3: "Margin",
  D3: "Margin %",
  A4: "1200",
  B4: "720",
  C4: "=A4-B4",
  D4: "=C4/A4",
  A5: "980",
  B5: "610",
  C5: "=A5-B5",
  D5: "=C5/A5",
  A6: "1440",
  B6: "850",
  C6: "=A6-B6",
  D6: "=C6/A6",
  A8: "Total",
  B8: "=SUM(B4:B6)",
  C8: "=SUM(C4:C6)",
  D8: "=C8/SUM(A4:A6)",
  F3: "Try these",
  F4: "=SUM(C4:C6)",
  F5: "=A4*2",
  F6: "=A4/0",
};

type PersistedRepositories = SpreadsheetRepositories &
  Readonly<{ dispose: () => void }>;

type Runtime = Readonly<{
  repositories: PersistedRepositories | null;
  storage: "opfs-sahpool" | "opfs" | "memory" | "engine-memory";
}>;

const contentInput = (content: CellContent | null): string => {
  if (content === null) return "";
  if (content.kind === "formula") return content.source;
  switch (content.literal.kind) {
    case "number":
      return String(content.literal.value);
    case "boolean":
      return content.literal.value ? "TRUE" : "FALSE";
    case "text":
      return content.literal.value;
  }
};

const toSpreadsheetValue = (value: CellValue): SpreadsheetValue => {
  switch (value.kind) {
    case "blank":
      return { kind: "blank", display: "" };
    case "number":
      return { kind: "number", raw: value.value, display: formatCellValue(value) };
    case "text":
      return { kind: "text", raw: value.value, display: value.value };
    case "boolean":
      return { kind: "boolean", raw: value.value, display: formatCellValue(value) };
    case "error":
      return {
        kind: "error",
        display: formatCellValue(value),
        errorCode: value.code,
        origin: cellAddressFor(value.origin),
      };
  }
};

const cellAddressFor = (id: CellId): string =>
  formatA1Address(cellIdParts(id).address);

const tokenKind = (token: EngineFormulaToken): FormulaToken["kind"] => {
  switch (token.kind) {
    case "number":
      return "number";
    case "reference":
      return "reference";
    case "operator":
      return "operator";
    case "identifier":
      return "function";
    case "left-paren":
    case "right-paren":
    case "comma":
    case "colon":
      return "punctuation";
    case "text":
    case "boolean":
    case "invalid":
    case "eof":
      return "text";
  }
};

const inspectionTokens = (tokens: readonly EngineFormulaToken[]): readonly FormulaToken[] =>
  tokens
    .filter((token) => token.kind !== "eof")
    .map((token) => ({ kind: tokenKind(token), lexeme: token.lexeme }));

const dependencyLabel = (dependency: CalculationSnapshot["graph"]["precedentsByCell"] extends ReadonlyMap<CellId, readonly (infer Dependency)[]> ? Dependency : never): string => {
  if (dependency.kind === "cell") {
    return cellAddressFor(dependency.precedent);
  }
  return `${formatA1Address(dependency.start)}:${formatA1Address(dependency.end)}`;
};

const initialRevision = (): WorkbookRevision => {
  const cells = new Map<CellId, Cell>();
  for (const [address, input] of Object.entries(demoInputs)) {
    const content = parseCellInput(input);
    if (content === null) continue;
    const id = cellId(worksheetIdentifier, parseA1Address(address));
    cells.set(
      id,
      new Cell({ id, content, modifiedRevision: revisionNumber(0) }),
    );
  }
  return new WorkbookRevision({
    workbookId: workbookIdentifier,
    number: revisionNumber(0),
    worksheets: [worksheet],
    cells,
  });
};

/**
 * Browser controller that preserves the explicit state boundary:
 * source changes create WorkbookRevision instances, then the engine derives a
 * fresh CalculationSnapshot. SQLite is the normal source store; direct engine
 * memory is retained only when the platform cannot start SQLite WASM at all.
 */
export function createEngineSpreadsheetClient(): SpreadsheetClient {
  let runtimePromise: Promise<Runtime> | undefined;
  let readyPromise: Promise<void> | undefined;
  let currentWorkbook: Workbook | undefined;
  let currentRevision: WorkbookRevision | undefined;
  let currentSnapshot: CalculationSnapshot | undefined;
  let disposed = false;

  const runtime = (): Promise<Runtime> => {
    if (disposed) {
      return Promise.reject(new Error("Spreadsheet client was disposed."));
    }
    runtimePromise ??= createBrowserRepositories()
      .then((repositories) => ({
        repositories,
        storage: repositories.storage,
      }))
      .catch((error: unknown) => {
        // The learning app remains useful on browsers that cannot load the
        // SQLite WASM artifact. Its fallback is still the real calculation
        // engine rather than a second, divergent evaluator.
        console.warn("Gridline SQLite storage is unavailable; using engine memory.", error);
        return { repositories: null, storage: "engine-memory" };
      });
    return runtimePromise;
  };

  const activate = (workbook: Workbook, revision: WorkbookRevision): void => {
    const previous =
      currentRevision !== undefined && currentSnapshot !== undefined
        ? { revision: currentRevision, snapshot: currentSnapshot }
        : undefined;
    currentWorkbook = workbook;
    currentRevision = revision;
    currentSnapshot = recalculate(revision, previous);
  };

  const ensureReady = (): Promise<void> => {
    readyPromise ??= (async () => {
      const activeRuntime = await runtime();
      if (activeRuntime.repositories === null) {
        const revision = initialRevision();
        activate(
          new Workbook({
            id: workbookIdentifier,
            name: workbookName("Formula laboratory"),
            currentRevision: revisionNumber(0),
          }),
          revision,
        );
        return;
      }

      const existingWorkbook = await findWorkbook(
        activeRuntime.repositories,
        workbookIdentifier,
      );
      if (existingWorkbook !== null) {
        const existingRevision = await findWorkbookRevision(
          activeRuntime.repositories,
          existingWorkbook.id,
          Number(existingWorkbook.currentRevision),
        );
        if (existingRevision !== null) {
          activate(existingWorkbook, existingRevision);
          return;
        }
      }

      const revision = initialRevision();
      const workbook = new Workbook({
        id: workbookIdentifier,
        name: workbookName("Formula laboratory"),
        currentRevision: revision.number,
      });
      await createWorkbook(activeRuntime.repositories, { workbook, revision });
      activate(workbook, revision);
    })();
    return readyPromise;
  };

  const state = (): Readonly<{
    workbook: Workbook;
    revision: WorkbookRevision;
    snapshot: CalculationSnapshot;
  }> => {
    if (
      currentWorkbook === undefined ||
      currentRevision === undefined ||
      currentSnapshot === undefined
    ) {
      throw new Error("Spreadsheet client is not ready.");
    }
    return {
      workbook: currentWorkbook,
      revision: currentRevision,
      snapshot: currentSnapshot,
    };
  };

  const view = (): WorkbookView => {
    const current = state();
    const cells = new Map<string, CellView>();
    for (const [id, cell] of current.revision.cells) {
      const parts = cellIdParts(id);
      if (parts.worksheetId !== worksheetIdentifier) continue;
      const address = formatA1Address(parts.address);
      cells.set(address, {
        address,
        input: contentInput(cell.content),
        value: toSpreadsheetValue(current.snapshot.values.get(id) ?? { kind: "blank" }),
        modifiedRevision: Number(cell.modifiedRevision),
      });
    }
    return {
      id: current.workbook.id,
      name: current.workbook.name,
      worksheetName: current.revision.worksheets[0]?.name ?? "Sheet1",
      revision: Number(current.revision.number),
      cells,
      dirtyCells: current.snapshot.dirtyCellIds.map(cellAddressFor),
      evaluationOrder: current.snapshot.evaluationOrder.map(cellAddressFor),
    };
  };

  const inspection = (address: string): CalculationInspection => {
    const current = state();
    const id = cellId(worksheetIdentifier, parseA1Address(address));
    const cell = current.revision.cells.get(id);
    const analysis = current.snapshot.formulas.get(id);
    const dependencies = current.snapshot.graph.precedentsByCell.get(id) ?? [];
    const errors = [...current.snapshot.values]
      .filter(([, value]) => value.kind === "error")
      .map(([errorId, value]) => {
        if (value.kind !== "error") return "";
        return `${cellAddressFor(errorId)}: ${formatCellValue(value)} — ${value.message}`;
      });

    return {
      address: formatA1Address(parseA1Address(address)),
      source: cell === undefined ? null : contentInput(cell.content),
      tokens: analysis ? inspectionTokens(analysis.parse.tokens) : [],
      ast:
        analysis?.parse.kind === "success"
          ? JSON.stringify(analysis.parse.expression, null, 2)
          : analysis?.parse.kind === "error"
            ? `ParseError: ${analysis.parse.error.message}`
            : null,
      precedents: dependencies.map(dependencyLabel),
      dependents: dependentsOf(current.snapshot.graph, id).map(cellAddressFor),
      dirtyCells: current.snapshot.dirtyCellIds.map(cellAddressFor),
      evaluationOrder: current.snapshot.evaluationOrder.map(cellAddressFor),
      errors,
    };
  };

  const createMemoryRevision = (
    content: CellContent | null,
    target: CellId,
  ): WorkbookRevision => {
    const current = state();
    const nextNumber = revisionNumber(Number(current.revision.number) + 1);
    const cells = new Map(current.revision.cells);
    if (content === null) {
      cells.delete(target);
    } else {
      cells.set(
        target,
        new Cell({ id: target, content, modifiedRevision: nextNumber }),
      );
    }
    return new WorkbookRevision({
      workbookId: current.revision.workbookId,
      number: nextNumber,
      worksheets: current.revision.worksheets,
      cells,
    });
  };

  return {
    async open() {
      await ensureReady();
      return view();
    },

    async createCell({ address, input }: CellInput) {
      await ensureReady();
      const target = cellId(worksheetIdentifier, parseA1Address(address));
      const content = parseCellInput(input);
      const current = state();
      const activeRuntime = await runtime();

      if (activeRuntime.repositories === null) {
        const revision = createMemoryRevision(content, target);
        activate(
          new Workbook({
            id: current.workbook.id,
            name: current.workbook.name,
            currentRevision: revision.number,
          }),
          revision,
        );
        return view();
      }

      const result = await createWorkbookRevision(
        activeRuntime.repositories,
        workbookChangeSet({
          workbookId: current.workbook.id,
          baseRevision: current.revision.number,
          cellChanges: [{ cellId: target, content }],
        }),
      );
      if (result.kind !== "created") {
        throw new Error(
          result.kind === "edit-conflict"
            ? `Edit conflict in ${result.conflictingCellIds.map(cellAddressFor).join(", ")}.`
            : "The active WorkbookRevision is no longer available.",
        );
      }
      activate(
        new Workbook({
          id: current.workbook.id,
          name: current.workbook.name,
          currentRevision: result.revision.number,
        }),
        result.revision,
      );
      return view();
    },

    async inspect(address: string) {
      await ensureReady();
      return inspection(address);
    },

    async recalculate() {
      await ensureReady();
      const current = state();
      currentSnapshot = recalculate(current.revision);
      return view();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      void runtimePromise?.then(({ repositories }) => repositories?.dispose());
    },
  };
}
