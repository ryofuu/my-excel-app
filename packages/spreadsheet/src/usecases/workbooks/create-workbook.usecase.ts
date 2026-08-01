import type {
  SpreadsheetRepositories,
} from "../ports/spreadsheet-repositories.port";
import type { WorkbookSeed, WorkbookState } from "./workbook-state.type";

/** Creates one workbook together with its first complete revision. */
export const createWorkbook = (
  repositories: SpreadsheetRepositories,
  seed: WorkbookSeed,
): Promise<WorkbookState> => repositories.workbooks.create(seed);
