import {
  Cell,
  Workbook,
  WorkbookRevision,
  cellIdParts,
  revisionNumber,
  type CellId,
  type WorkbookChangeSet,
  type WorkbookId,
} from "@gridline/spreadsheet/domain";

import type {
  SpreadsheetRepositories,
  WorkbookRepository,
  WorkbookRevisionCreateResult,
  WorkbookRevisionRepository,
  WorkbookSeed,
} from "@gridline/spreadsheet/usecases";

type StoredWorkbook = {
  workbook: Workbook;
  revision: WorkbookRevision;
  /** Includes null-content tombstones, unlike `revision.cells`. */
  cellStates: Map<CellId, Cell>;
};

const materializedCells = (states: ReadonlyMap<CellId, Cell>): Map<CellId, Cell> =>
  new Map([...states].filter(([, cell]) => cell.content !== null));

const createStoredWorkbook = (seed: WorkbookSeed): StoredWorkbook => {
  if (seed.workbook.id !== seed.revision.workbookId) {
    throw new RangeError("Workbook and initial revision must have the same id.");
  }
  if (seed.workbook.currentRevision !== seed.revision.number) {
    throw new RangeError("Workbook and initial revision must have the same number.");
  }
  if (Number(seed.revision.number) !== 0) {
    throw new RangeError("The initial workbook revision must be 0.");
  }
  return {
    workbook: seed.workbook,
    revision: seed.revision,
    cellStates: new Map(seed.revision.cells),
  };
};

/**
 * A test and fallback implementation of the same repository semantics as the
 * SQLite adapter. It intentionally keeps only the current revision, while
 * retaining tombstones for optimistic conflict detection.
 */
export const createInMemoryRepositories = (): SpreadsheetRepositories => {
  const storedWorkbooks = new Map<WorkbookId, StoredWorkbook>();

  const workbooks: WorkbookRepository = {
    create: async (seed) => {
      if (storedWorkbooks.has(seed.workbook.id)) {
        throw new Error(`Workbook already exists: ${seed.workbook.id}`);
      }
      storedWorkbooks.set(seed.workbook.id, createStoredWorkbook(seed));
      return { workbook: seed.workbook, revision: seed.revision };
    },
    find: async (id) => {
      const stored = storedWorkbooks.get(id);
      return stored
        ? { workbook: stored.workbook, revision: stored.revision }
        : null;
    },
    delete: async (id) => {
      storedWorkbooks.delete(id);
    },
  };

  const revisions: WorkbookRevisionRepository = {
    create: async (
      changeSet: WorkbookChangeSet,
    ): Promise<WorkbookRevisionCreateResult> => {
      if (
        changeSet.cellChanges.length === 0 &&
        changeSet.nextWorksheets === undefined
      ) {
        throw new RangeError("WorkbookChangeSet must change Cells or Worksheets.");
      }
      const stored = storedWorkbooks.get(changeSet.workbookId);
      if (!stored) {
        return { kind: "workbook-not-found" };
      }

      const currentRevision = Number(stored.workbook.currentRevision);
      const baseRevision = Number(changeSet.baseRevision);
      if (baseRevision < 0 || baseRevision > currentRevision) {
        return { kind: "revision-not-found", requestedRevision: baseRevision };
      }
      if (
        changeSet.nextWorksheets !== undefined &&
        baseRevision !== currentRevision
      ) {
        return { kind: "revision-not-found", requestedRevision: baseRevision };
      }

      const nextWorksheets =
        changeSet.nextWorksheets ?? stored.revision.worksheets;
      const nextWorksheetIds = new Set(
        nextWorksheets.map((worksheet) => worksheet.id),
      );
      const cellsWithoutWorksheet = changeSet.cellChanges
        .filter(
          (change) =>
            !nextWorksheetIds.has(cellIdParts(change.cellId).worksheetId),
        )
        .map((change) => change.cellId);
      if (cellsWithoutWorksheet.length > 0) {
        if (
          changeSet.nextWorksheets === undefined &&
          baseRevision < currentRevision
        ) {
          return {
            kind: "edit-conflict",
            conflictingCellIds: cellsWithoutWorksheet,
          };
        }
        throw new RangeError(
          "CellChange targets a Worksheet absent from the next revision.",
        );
      }

      const conflictingCellIds = changeSet.cellChanges
        .filter((change) => {
          const state = stored.cellStates.get(change.cellId);
          return state !== undefined && Number(state.modifiedRevision) > baseRevision;
        })
        .map((change) => change.cellId);
      if (conflictingCellIds.length > 0) {
        return { kind: "edit-conflict", conflictingCellIds };
      }

      const nextRevision = revisionNumber(currentRevision + 1);
      const nextStates = new Map(
        [...stored.cellStates].filter(([id]) =>
          nextWorksheetIds.has(cellIdParts(id).worksheetId),
        ),
      );
      for (const change of changeSet.cellChanges) {
        nextStates.set(
          change.cellId,
          new Cell({
            id: change.cellId,
            content: change.content,
            modifiedRevision: nextRevision,
          }),
        );
      }

      const revision = new WorkbookRevision({
        workbookId: stored.revision.workbookId,
        number: nextRevision,
        worksheets: nextWorksheets,
        cells: materializedCells(nextStates),
      });
      const workbook = new Workbook({
        id: stored.workbook.id,
        name: stored.workbook.name,
        currentRevision: nextRevision,
      });
      storedWorkbooks.set(changeSet.workbookId, {
        workbook,
        revision,
        cellStates: nextStates,
      });
      return { kind: "created", state: { workbook, revision } };
    },
  };

  return { workbooks, revisions };
};
