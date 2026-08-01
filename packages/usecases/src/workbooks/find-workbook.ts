import type { Workbook, WorkbookId } from "@gridline/domain";

import type { SpreadsheetRepositories } from "../ports/spreadsheet-repositories";

export const findWorkbook = (
  repositories: SpreadsheetRepositories,
  id: WorkbookId,
): Promise<Workbook | null> => repositories.workbooks.find(id);
