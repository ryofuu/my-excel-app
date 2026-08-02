import type { Workbook, WorkbookId } from "@gridline/core/domain";

import type { SpreadsheetRepositories } from "../ports/spreadsheet-repositories.port";

export const findWorkbook = (
  repositories: SpreadsheetRepositories,
  id: WorkbookId,
): Promise<Workbook | null> => repositories.workbooks.find(id);
