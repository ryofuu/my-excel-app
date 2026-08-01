import type { WorkbookId } from "@gridline/domain";

import type { SpreadsheetRepositories } from "../ports/spreadsheet-repositories";

export const deleteWorkbook = (
  repositories: SpreadsheetRepositories,
  id: WorkbookId,
): Promise<void> => repositories.workbooks.delete(id);
