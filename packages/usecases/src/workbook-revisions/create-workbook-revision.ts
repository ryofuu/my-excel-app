import type { WorkbookChangeSet } from "@gridline/domain";

import type {
  SpreadsheetRepositories,
  WorkbookRevisionCreateResult,
} from "../ports/spreadsheet-repositories";

/** Applies one user operation by creating exactly one next revision. */
export const createWorkbookRevision = (
  repositories: SpreadsheetRepositories,
  changeSet: WorkbookChangeSet,
): Promise<WorkbookRevisionCreateResult> =>
  repositories.revisions.create(changeSet);
