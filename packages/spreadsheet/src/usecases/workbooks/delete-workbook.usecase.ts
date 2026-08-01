import type { WorkbookId } from "@gridline/spreadsheet/domain";

import type { SpreadsheetRepositories } from "../ports/spreadsheet-repositories.port";

export const deleteWorkbook = (
  repositories: SpreadsheetRepositories,
  id: WorkbookId,
): Promise<void> => repositories.workbooks.delete(id);
