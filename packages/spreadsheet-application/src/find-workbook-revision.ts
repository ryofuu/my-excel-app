import type {
  WorkbookId,
  WorkbookRevision,
} from "@gridline/spreadsheet-engine";

import type { SpreadsheetRepositories } from "./ports";

export const findWorkbookRevision = (
  repositories: SpreadsheetRepositories,
  workbookId: WorkbookId,
  revision: number,
): Promise<WorkbookRevision | null> =>
  repositories.revisions.find(workbookId, revision);
