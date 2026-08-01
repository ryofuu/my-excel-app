import type { WorkbookId } from "@gridline/spreadsheet/domain";

import type { SpreadsheetRepositories } from "../ports/spreadsheet-repositories.port";
import type { WorkbookState } from "./workbook-state.type";

export const findWorkbook = (
  repositories: SpreadsheetRepositories,
  id: WorkbookId,
): Promise<WorkbookState | null> => repositories.workbooks.find(id);
