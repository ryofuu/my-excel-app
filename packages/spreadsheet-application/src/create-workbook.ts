import type { Workbook } from "@gridline/spreadsheet-engine";

import type { SpreadsheetRepositories, WorkbookSeed } from "./ports";

/** Creates one workbook together with its first complete revision. */
export const createWorkbook = (
  repositories: SpreadsheetRepositories,
  seed: WorkbookSeed,
): Promise<Workbook> => repositories.workbooks.create(seed);
