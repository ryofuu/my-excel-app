import type { Workbook } from "@gridline/core/domain";

import type {
  SpreadsheetRepositories,
  WorkbookCreateResult,
} from "../ports/spreadsheet-repositories.port";

/** Workbook と、その最初の完全な Revision を一緒に永続化する。 */
export const createWorkbook = (
  repositories: SpreadsheetRepositories,
  workbook: Workbook,
): Promise<WorkbookCreateResult> => repositories.workbooks.create(workbook);
