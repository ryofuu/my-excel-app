import type { Workbook } from "@gridline/spreadsheet/domain";

import type {
  SpreadsheetRepositories,
  WorkbookSeed,
} from "../ports/spreadsheet-repositories.port";

/** Creates one workbook together with its first complete revision. */
export const createWorkbook = (
  repositories: SpreadsheetRepositories,
  seed: WorkbookSeed,
): Promise<Workbook> => repositories.workbooks.create(seed);
