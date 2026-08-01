import type { Workbook, WorkbookRevision } from "@gridline/spreadsheet/domain";

/**
 * One consistent persisted source state. CalculationSnapshot is intentionally
 * excluded because it is derived again from the WorkbookRevision.
 */
export type WorkbookState = Readonly<{
  workbook: Workbook;
  revision: WorkbookRevision;
}>;

/** The complete source state required to create a Workbook. */
export type WorkbookSeed = WorkbookState;
