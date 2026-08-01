import type {
  WorkbookId,
  WorkbookRevision,
} from "@gridline/spreadsheet/domain";

import type { SpreadsheetRepositories } from "../ports/spreadsheet-repositories.port";

export const findWorkbookRevision = (
  repositories: SpreadsheetRepositories,
  workbookId: WorkbookId,
  revision: number,
): Promise<WorkbookRevision | null> =>
  repositories.revisions.find(workbookId, revision);
