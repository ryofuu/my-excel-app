import {
  createWorkbookRevision as createNextWorkbookRevision,
  type CellId,
  type RevisionNumber,
  type Workbook,
  type WorkbookChangeSet,
} from "@gridline/core/domain";

import type { SpreadsheetRepositories } from "../ports/spreadsheet-repositories.port";

export type WorkbookRevisionCreateResult =
  | Readonly<{ kind: "created"; workbook: Workbook }>
  | Readonly<{
      kind: "edit-conflict";
      conflictingCellIds: readonly CellId[];
    }>
  | Readonly<{ kind: "workbook-not-found" }>
  | Readonly<{
      kind: "revision-not-found";
      requestedRevision: RevisionNumber;
    }>;

/** 1つの業務操作を、永続化された1つの次 Revision として確定する。 */
export const createWorkbookRevision = (
  repositories: SpreadsheetRepositories,
  changeSet: WorkbookChangeSet,
): Promise<WorkbookRevisionCreateResult> =>
  createAndPersistWorkbookRevision(repositories, changeSet);

const createAndPersistWorkbookRevision = async (
  repositories: SpreadsheetRepositories,
  changeSet: WorkbookChangeSet,
): Promise<WorkbookRevisionCreateResult> => {
  while (true) {
    // 判定の起点は常に Repository から読み直した最新の Aggregate とする。
    const current = await repositories.workbooks.find(changeSet.workbookId);
    if (current === null) {
      return { kind: "workbook-not-found" };
    }

    // Revision の生成可否と Cell 単位の競合判定は Domain に委ねる。
    const creation = createNextWorkbookRevision(current, changeSet);
    if (creation.kind === "edit-conflict") {
      return {
        kind: "edit-conflict",
        conflictingCellIds: creation.conflictingCellIds,
      };
    }
    if (creation.kind === "revision-not-found") {
      return creation;
    }

    // 読み込んだ Revision を expectedRevision にした CAS で、read-write 間の競合を検出する。
    const update = await repositories.workbooks.update(
      creation.workbook,
      current.revision.number,
    );
    if (update.kind === "updated") {
      return { kind: "created", workbook: creation.workbook };
    }
    if (update.kind === "workbook-not-found") {
      return update;
    }
    // CAS に負けた場合、計算済み Workbook をそのまま保存してはいけない。
    // 元の ChangeSet を最新版へ再評価し、安全にマージできるかを Domain にもう一度判断させる。
  }
};
