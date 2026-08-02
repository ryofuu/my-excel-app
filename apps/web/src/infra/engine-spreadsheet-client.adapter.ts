import {
  createWorkbook,
  createWorkbookRevision,
  findWorkbook,
  type SpreadsheetRepositories,
  type WorkbookState,
} from "@gridline/spreadsheet/usecases";
import {
  createHttpSpreadsheetRepositories,
} from "@gridline/spreadsheet/infra";
import {
  Worksheet,
  cellId,
  cellIdParts,
  formulaSource,
  formatA1Address,
  parseA1Address,
  parseCellInput,
  recalculate,
  translateFormula,
  workbookChangeSet,
  type CellId,
  type WorksheetId,
  worksheetId,
  worksheetName,
} from "@gridline/spreadsheet/domain";

import type {
  CellInput,
  SpreadsheetClient,
} from "@/usecases/spreadsheet-client.port";

import {
  formulaLaboratorySeed,
  formulaLaboratoryWorkbookId,
} from "./formula-laboratory.seed";
import {
  calculationInspection,
  workbookView,
  type CalculatedWorkbookState,
} from "./spreadsheet-view.projection";

type DisposableRepositories = SpreadsheetRepositories &
  Readonly<{ dispose?: () => void }>;

type RepositorySource = () => Promise<DisposableRepositories>;

type ClientLifecycle =
  | Readonly<{ kind: "idle" }>
  | Readonly<{
      kind: "opening";
      state: Promise<CalculatedWorkbookState>;
    }>
  | Readonly<{
      kind: "ready";
      state: CalculatedWorkbookState;
    }>
  | Readonly<{ kind: "disposed" }>;

const serverRepositorySource: RepositorySource = () =>
  Promise.resolve(createHttpSpreadsheetRepositories());

const cellAddressFor = (id: CellId): string =>
  formatA1Address(cellIdParts(id).address);

const calculatedState = (
  source: WorkbookState,
  previous?: CalculatedWorkbookState,
): CalculatedWorkbookState => ({
  ...source,
  snapshot: recalculate(
    source.revision,
    previous === undefined
      ? undefined
      : { revision: previous.revision, snapshot: previous.snapshot },
  ),
});

/**
 * Owns the browser lifecycle around the calculation engine. Source changes
 * always pass through one Repository Interface before a fresh
 * CalculationSnapshot is derived.
 */
export function createEngineSpreadsheetClient(
  repositorySource: RepositorySource = serverRepositorySource,
): SpreadsheetClient {
  let lifecycle: ClientLifecycle = { kind: "idle" };
  let repositoriesPromise: Promise<DisposableRepositories> | undefined;
  let activeWorksheetId: WorksheetId | undefined;

  const assertActive = (): void => {
    if (lifecycle.kind === "disposed") {
      throw new Error("Spreadsheet client was disposed.");
    }
  };

  const repositories = (): Promise<DisposableRepositories> => {
    assertActive();
    repositoriesPromise ??= repositorySource();
    return repositoriesPromise;
  };

  const openState = async (): Promise<CalculatedWorkbookState> => {
    const activeRepositories = await repositories();
    assertActive();
    const existing = await findWorkbook(
      activeRepositories,
      formulaLaboratoryWorkbookId,
    );
    assertActive();
    if (existing !== null) {
      return calculatedState(existing);
    }

    const seed = formulaLaboratorySeed();
    try {
      const created = await createWorkbook(activeRepositories, seed);
      assertActive();
      return calculatedState(created);
    } catch (error: unknown) {
      // Another browser context may create the fixed demo Workbook after our
      // find and before our create. Prefer its consistent current state.
      assertActive();
      const concurrent = await findWorkbook(
        activeRepositories,
        formulaLaboratoryWorkbookId,
      );
      assertActive();
      if (concurrent !== null) {
        return calculatedState(concurrent);
      }
      throw error;
    }
  };

  const readyState = (): Promise<CalculatedWorkbookState> => {
    switch (lifecycle.kind) {
      case "ready":
        return Promise.resolve(lifecycle.state);
      case "opening":
        return lifecycle.state;
      case "disposed":
        return Promise.reject(new Error("Spreadsheet client was disposed."));
      case "idle": {
        const opening = openState();
        const tracked = opening.then(
          (state) => {
            assertActive();
            if (lifecycle.kind === "opening" && lifecycle.state === tracked) {
              lifecycle = { kind: "ready", state };
            }
            return state;
          },
          (error: unknown) => {
            if (lifecycle.kind === "opening" && lifecycle.state === tracked) {
              lifecycle = { kind: "idle" };
            }
            throw error;
          },
        );
        lifecycle = { kind: "opening", state: tracked };
        return tracked;
      }
    }
  };

  const activate = (
    source: WorkbookState,
    previous?: CalculatedWorkbookState,
  ): CalculatedWorkbookState => {
    assertActive();
    const state = calculatedState(source, previous);
    lifecycle = { kind: "ready", state };
    return state;
  };

  const activeWorksheetFor = (
    state: CalculatedWorkbookState,
    requestedId?: string,
  ): WorksheetId => {
    const requested =
      requestedId === undefined ? activeWorksheetId : worksheetId(requestedId);
    if (requested !== undefined) {
      const exists = state.revision.worksheets.some(
        (worksheet) => worksheet.id === requested,
      );
      if (exists) return requested;
      if (requestedId !== undefined) {
        throw new Error(`Worksheet not found: ${requestedId}`);
      }
    }
    const first = state.revision.worksheets[0];
    if (first === undefined) {
      throw new Error("WorkbookRevision must contain at least one Worksheet.");
    }
    return first.id;
  };

  const view = (
    state: CalculatedWorkbookState,
    requestedId?: string,
  ): ReturnType<typeof workbookView> => {
    activeWorksheetId = activeWorksheetFor(state, requestedId);
    return workbookView(state, activeWorksheetId);
  };

  const nextWorksheetName = (
    state: CalculatedWorkbookState,
  ): ReturnType<typeof worksheetName> => {
    const names = new Set(
      state.revision.worksheets.map((worksheet) => String(worksheet.name)),
    );
    let sequence = 1;
    while (names.has(`Sheet${sequence}`)) sequence += 1;
    return worksheetName(`Sheet${sequence}`);
  };

  return {
    async open(worksheetIdValue) {
      const state = await readyState();
      return view(state, worksheetIdValue);
    },

    async createWorksheet() {
      const current = await readyState();
      const worksheet = new Worksheet({
        id: worksheetId(`worksheet-${crypto.randomUUID()}`),
        name: nextWorksheetName(current),
      });
      const result = await createWorkbookRevision(
        await repositories(),
        workbookChangeSet({
          workbookId: current.workbook.id,
          baseRevision: current.revision.number,
          cellChanges: [],
          nextWorksheets: [...current.revision.worksheets, worksheet],
        }),
      );
      assertActive();
      if (result.kind !== "created") {
        throw new Error("The active WorkbookRevision is no longer available.");
      }
      const state = activate(result.state, current);
      return view(state, worksheet.id);
    },

    async deleteWorksheet() {
      const current = await readyState();
      if (current.revision.worksheets.length === 1) {
        throw new Error("Workbook must retain at least one Worksheet.");
      }
      const worksheetIdValue = activeWorksheetFor(current);
      const currentIndex = current.revision.worksheets.findIndex(
        (worksheet) => worksheet.id === worksheetIdValue,
      );
      const nextWorksheets = current.revision.worksheets.filter(
        (worksheet) => worksheet.id !== worksheetIdValue,
      );
      const nextActiveWorksheet =
        nextWorksheets[Math.max(0, currentIndex - 1)] ?? nextWorksheets[0];
      if (nextActiveWorksheet === undefined) {
        throw new Error("Workbook must retain at least one Worksheet.");
      }
      const result = await createWorkbookRevision(
        await repositories(),
        workbookChangeSet({
          workbookId: current.workbook.id,
          baseRevision: current.revision.number,
          cellChanges: [],
          nextWorksheets,
        }),
      );
      assertActive();
      if (result.kind !== "created") {
        throw new Error("The active WorkbookRevision is no longer available.");
      }
      const state = activate(result.state, current);
      return view(state, nextActiveWorksheet.id);
    },

    async createCells(inputs: readonly CellInput[]) {
      const current = await readyState();
      const worksheetIdValue = activeWorksheetFor(current);
      if (inputs.length === 0) {
        return view(current);
      }
      const cellChanges = inputs.map(({ address, input, copiedFromAddress }) => {
        const target = cellId(
          worksheetIdValue,
          parseA1Address(address),
        );
        const translatedInput =
          copiedFromAddress === undefined || !input.startsWith("=")
            ? input
            : (() => {
                const translation = translateFormula(
                  formulaSource(input),
                  parseA1Address(copiedFromAddress),
                  parseA1Address(address),
                );
                if (translation.kind === "error") {
                  throw new Error(translation.message);
                }
                return translation.source;
              })();
        return { cellId: target, content: parseCellInput(translatedInput) };
      });
      const result = await createWorkbookRevision(
        await repositories(),
        workbookChangeSet({
          workbookId: current.workbook.id,
          baseRevision: current.revision.number,
          cellChanges,
        }),
      );
      assertActive();
      if (result.kind !== "created") {
        throw new Error(
          result.kind === "edit-conflict"
            ? `Edit conflict in ${result.conflictingCellIds.map(cellAddressFor).join(", ")}.`
            : "The active WorkbookRevision is no longer available.",
        );
      }
      const state = activate(result.state, current);
      return view(state);
    },

    async inspect(address: string) {
      const current = await readyState();
      return calculationInspection(
        current,
        activeWorksheetFor(current),
        address,
      );
    },

    async recalculate() {
      const current = await readyState();
      assertActive();
      const state: CalculatedWorkbookState = {
        ...current,
        snapshot: recalculate(current.revision),
      };
      lifecycle = { kind: "ready", state };
      return view(state);
    },

    dispose() {
      if (lifecycle.kind === "disposed") return;
      lifecycle = { kind: "disposed" };
      void repositoriesPromise?.then(
        (activeRepositories) => activeRepositories.dispose?.(),
        () => undefined,
      );
    },
  };
}
