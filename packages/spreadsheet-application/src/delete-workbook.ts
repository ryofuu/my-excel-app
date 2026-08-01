import type { WorkbookId } from "@gridline/spreadsheet-engine";

import type { SpreadsheetRepositories } from "./ports";

export const deleteWorkbook = (
  repositories: SpreadsheetRepositories,
  id: WorkbookId,
): Promise<void> => repositories.workbooks.delete(id);
