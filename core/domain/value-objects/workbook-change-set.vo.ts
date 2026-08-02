import type { Worksheet } from "../entities/worksheet.entity";
import type { CellId } from "./cell-address.vo";
import type { CellContent } from "./cell-content.vo";
import type { RevisionNumber, WorkbookId } from "./identifiers.vo";
import { brand, type Brand } from "./brand.type";

export type CellChange = Readonly<{
  cellId: CellId;
  content: CellContent | null;
}>;

/** Domain が1つの次 Revision を生成するための、検証済みで不可分な編集。 */
type WorkbookChangeSetValue = Readonly<{
  workbookId: WorkbookId;
  baseRevision: RevisionNumber;
  cellChanges: readonly CellChange[];
  /** 次 Revision の完全な順序付き Worksheet 一覧。変更しない場合は省略する。 */
  nextWorksheets?: readonly Worksheet[];
}>;

export type WorkbookChangeSet = Brand<
  WorkbookChangeSetValue,
  "WorkbookChangeSet"
>;

export type EditConflict = Readonly<{
  kind: "edit-conflict";
  workbookId: WorkbookId;
  baseRevision: RevisionNumber;
  conflictingCellIds: readonly CellId[];
}>;

export const workbookChangeSet = (
  properties: WorkbookChangeSetValue,
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

  const worksheetIds = new Set<string>();
  const worksheetNames = new Set<string>();
  for (const worksheet of properties.nextWorksheets ?? []) {
    if (worksheetIds.has(worksheet.id)) {
      throw new Error(
        `WorkbookChangeSet contains duplicate WorksheetId: ${worksheet.id}`,
      );
    }
    if (worksheetNames.has(worksheet.name)) {
      throw new Error(
        `WorkbookChangeSet contains duplicate WorksheetName: ${worksheet.name}`,
      );
    }
    worksheetIds.add(worksheet.id);
    worksheetNames.add(worksheet.name);
  }

  return brand<WorkbookChangeSetValue, "WorkbookChangeSet">({
    workbookId: properties.workbookId,
    baseRevision: properties.baseRevision,
    cellChanges: Object.freeze([...properties.cellChanges]),
    ...(properties.nextWorksheets === undefined
      ? {}
      : { nextWorksheets: Object.freeze([...properties.nextWorksheets]) }),
  });
};
