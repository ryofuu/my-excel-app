import {
  createWorkbook,
  createWorkbookRevision,
  findWorkbook,
  type SpreadsheetRepositories,
  type WorkbookState,
} from "@gridline/spreadsheet/usecases";
import {
  createBrowserRepositories,
  createInMemoryRepositories,
} from "@gridline/spreadsheet/infra";
import {
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
} from "@gridline/spreadsheet/domain";

import type {
  CellInput,
  SpreadsheetClient,
} from "@/usecases/spreadsheet-client.port";

import {
  formulaLaboratorySeed,
  formulaLaboratoryWorkbookId,
  formulaLaboratoryWorksheetId,
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

const browserRepositorySource: RepositorySource = () =>
  createBrowserRepositories();

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
  repositorySource: RepositorySource = browserRepositorySource,
): SpreadsheetClient {
  let lifecycle: ClientLifecycle = { kind: "idle" };
  let repositoriesPromise: Promise<DisposableRepositories> | undefined;

  const assertActive = (): void => {
    if (lifecycle.kind === "disposed") {
      throw new Error("Spreadsheet client was disposed.");
    }
  };

  const repositories = (): Promise<DisposableRepositories> => {
    assertActive();
    repositoriesPromise ??= repositorySource().catch((error: unknown) => {
      console.warn(
        "Gridline SQLite storage is unavailable; using in-memory repositories.",
        error,
      );
      return createInMemoryRepositories();
    });
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

  return {
    async open() {
      const state = await readyState();
      return workbookView(state, formulaLaboratoryWorksheetId);
    },

    async createCells(inputs: readonly CellInput[]) {
      const current = await readyState();
      if (inputs.length === 0) {
        return workbookView(current, formulaLaboratoryWorksheetId);
      }
      const cellChanges = inputs.map(({ address, input, copiedFromAddress }) => {
        const target = cellId(
          formulaLaboratoryWorksheetId,
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
      return workbookView(state, formulaLaboratoryWorksheetId);
    },

    async inspect(address: string) {
      return calculationInspection(
        await readyState(),
        formulaLaboratoryWorksheetId,
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
      return workbookView(state, formulaLaboratoryWorksheetId);
    },

    dispose() {
      if (lifecycle.kind === "disposed") return;
      lifecycle = { kind: "disposed" };
      void repositoriesPromise?.then((activeRepositories) => {
        activeRepositories.dispose?.();
      });
    },
  };
}
