import type { WorkbookChangeSet } from "@gridline/spreadsheet/domain";

import type {
  SpreadsheetRepositories,
  WorkbookRevisionCreateResult,
} from "../ports/spreadsheet-repositories.port";

/** Applies one user operation by creating exactly one next revision. */
export const createWorkbookRevision = (
  repositories: SpreadsheetRepositories,
  changeSet: WorkbookChangeSet,
): Promise<WorkbookRevisionCreateResult> =>
  repositories.revisions.create(changeSet);
