import type { Worksheet } from "../entities/worksheet.entity";
import type { CellId } from "./cell-address.vo";
import type { CellContent } from "./cell-content.vo";
import type { RevisionNumber, WorkbookId } from "./identifiers.vo";

export type CellChange = Readonly<{
  cellId: CellId;
  content: CellContent | null;
}>;

/** A single atomic user edit. Persistence is responsible for creating its revision. */
export type WorkbookChangeSet = Readonly<{
  workbookId: WorkbookId;
  baseRevision: RevisionNumber;
  cellChanges: readonly CellChange[];
  /** Complete ordered Worksheet snapshot for the next revision. Omit when unchanged. */
  nextWorksheets?: readonly Worksheet[];
}>;

export type EditConflict = Readonly<{
  kind: "edit-conflict";
  workbookId: WorkbookId;
  baseRevision: RevisionNumber;
  conflictingCellIds: readonly CellId[];
}>;

export const workbookChangeSet = (
  properties: WorkbookChangeSet,
): WorkbookChangeSet => {
  if (
    properties.cellChanges.length === 0 &&
    properties.nextWorksheets === undefined
  ) {
    throw new Error("WorkbookChangeSet must change Cells or Worksheets.");
  }
  if (properties.nextWorksheets?.length === 0) {
    throw new Error("WorkbookChangeSet must retain at least one Worksheet.");
  }

  const seen = new Set<CellId>();
  for (const change of properties.cellChanges) {
    if (seen.has(change.cellId)) {
      throw new Error(`WorkbookChangeSet cannot change a Cell more than once: ${change.cellId}`);
    }
    seen.add(change.cellId);
  }

  return {
    workbookId: properties.workbookId,
    baseRevision: properties.baseRevision,
    cellChanges: Object.freeze([...properties.cellChanges]),
    ...(properties.nextWorksheets === undefined
      ? {}
      : { nextWorksheets: Object.freeze([...properties.nextWorksheets]) }),
  };
};
