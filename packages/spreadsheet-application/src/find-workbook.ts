import type { Workbook, WorkbookId } from "@gridline/spreadsheet-engine";

import type { SpreadsheetRepositories } from "./ports";

export const findWorkbook = (
  repositories: SpreadsheetRepositories,
  id: WorkbookId,
): Promise<Workbook | null> => repositories.workbooks.find(id);
