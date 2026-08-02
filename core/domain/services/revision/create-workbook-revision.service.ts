import { Cell } from "../../entities/cell.entity";
import { WorkbookRevision } from "../../entities/workbook-revision.entity";
import { Workbook } from "../../entities/workbook.entity";
import { cellIdParts, type CellId } from "../../value-objects/cell-address.vo";
import type {
  EditConflict,
  WorkbookChangeSet,
} from "../../value-objects/workbook-change-set.vo";
import { revisionNumber } from "../../value-objects/identifiers.vo";

export type WorkbookRevisionCreation =
  | Readonly<{ kind: "created"; workbook: Workbook }>
  | EditConflict
  | Readonly<{
      kind: "revision-not-found";
      requestedRevision: WorkbookChangeSet["baseRevision"];
    }>;

/** 検証済みの ChangeSet から、不変条件を満たす次の Workbook を一度に生成する。 */
export const createWorkbookRevision = (
  workbook: Workbook,
  changeSet: WorkbookChangeSet,
): WorkbookRevisionCreation => {
  if (workbook.id !== changeSet.workbookId) {
    throw new Error("WorkbookChangeSet belongs to a different Workbook.");
  }

  const current = workbook.revision;
  if (changeSet.baseRevision > current.number) {
    return {
      kind: "revision-not-found",
      requestedRevision: changeSet.baseRevision,
    };
  }
  // Worksheet の追加・削除・並び替えは Revision 全体の構造変更なので、
  // Cell 単位の競合判定では安全にマージできない。必ず最新版への操作に限定する。
  if (
    changeSet.nextWorksheets !== undefined &&
    changeSet.baseRevision !== current.number
  ) {
    return {
      kind: "revision-not-found",
      requestedRevision: changeSet.baseRevision,
    };
  }

  const nextWorksheets = changeSet.nextWorksheets ?? current.worksheets;
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
    // 古い Revision からの編集先が既に削除されていた場合は、入力不正ではなく競合として返す。
    // 最新版を基準に存在しない Worksheet を指定した場合だけ、ChangeSet 自体の不正とみなす。
    if (
      changeSet.nextWorksheets === undefined &&
      changeSet.baseRevision < current.number
    ) {
      return {
        kind: "edit-conflict",
        workbookId: workbook.id,
        baseRevision: changeSet.baseRevision,
        conflictingCellIds: cellsWithoutWorksheet,
      };
    }
    throw new Error(
      "CellChange targets a Worksheet absent from the next revision.",
    );
  }

  // Workbook 全体ではなく、基準 Revision より後に変更された同一 Cell だけを競合とする。
  // これにより、異なる Cell への同時編集は安全に同じ履歴へ取り込める。
  const conflictingCellIds = changeSet.cellChanges
    .filter((change) => {
      const cell = current.cells.get(change.cellId);
      return (
        cell !== undefined &&
        cell.modifiedRevision > changeSet.baseRevision
      );
    })
    .map((change) => change.cellId);

  if (conflictingCellIds.length > 0) {
    return {
      kind: "edit-conflict",
      workbookId: workbook.id,
      baseRevision: changeSet.baseRevision,
      conflictingCellIds,
    };
  }

  const number = revisionNumber(Number(current.number) + 1);
  // 現在の状態を複製し、削除された Worksheet 配下の Cell だけを除外して次の状態を作る。
  const cells = new Map<CellId, Cell>(
    [...current.cells].filter(([, cell]) =>
      nextWorksheetIds.has(cellIdParts(cell.id).worksheetId),
    ),
  );
  for (const change of changeSet.cellChanges) {
    // 削除入力も content: null の Cell として残す。
    // modifiedRevision が残ることで、削除後の同時編集も同じ規則で競合判定できる。
    cells.set(
      change.cellId,
      new Cell({
        id: change.cellId,
        content: change.content,
        modifiedRevision: number,
      }),
    );
  }

  // Aggregate の生成を最後に通し、Worksheet と Cell の整合性を改めて保証する。
  return {
    kind: "created",
    workbook: new Workbook({
      id: workbook.id,
      name: workbook.name,
      revision: new WorkbookRevision({
        number,
        worksheets: nextWorksheets,
        cells,
      }),
    }),
  };
};
