import type { WorkbookRevision } from "../../entities/workbook-revision";
import type { CellId } from "../../value-objects/cell-address";
import { BLANK, type CellValue } from "../../value-objects/cell-value";
import type { CalculationTrace } from "./calculation-trace";
import type { DependencyGraph, FormulaAnalysis } from "./dependency-graph";

/**
 * The complete, non-persistent result derived from one WorkbookRevision.
 * WorkbookRevision remains the authoritative state; this is safe to discard
 * and recreate whenever the revision changes.
 */
export type CalculationSnapshot = Readonly<{
  sourceRevision: WorkbookRevision["number"];
  values: ReadonlyMap<CellId, CellValue>;
  formulas: ReadonlyMap<CellId, FormulaAnalysis>;
  graph: DependencyGraph;
  trace: CalculationTrace;
}>;

export type PreviousCalculation = Readonly<{
  revision: WorkbookRevision;
  snapshot: CalculationSnapshot;
}>;

export const calculationSnapshot = (
  snapshot: CalculationSnapshot,
): CalculationSnapshot => Object.freeze(snapshot);

export const valueInSnapshot = (snapshot: CalculationSnapshot, id: CellId): CellValue =>
  snapshot.values.get(id) ?? BLANK;
