import type { Workbook } from "../../entities/workbook.entity";
import type { CellId } from "../../value-objects/cell-address.vo";
import { BLANK, type CellValue } from "../../value-objects/cell-value.vo";
import type { CalculationTrace } from "./calculation-trace.derived";
import type { DependencyGraph, FormulaAnalysis } from "./dependency-graph.derived";

/**
 * 1つの WorkbookRevision から導出した完全な計算結果。
 * 観測用の複製を保存しても正本やCacheにはせず、常にRevisionから再生成できる。
 */
export type CalculationSnapshot = Readonly<{
  sourceRevision: Workbook["revision"]["number"];
  values: ReadonlyMap<CellId, CellValue>;
  formulas: ReadonlyMap<CellId, FormulaAnalysis>;
  graph: DependencyGraph;
  trace: CalculationTrace;
}>;

export type PreviousCalculation = Readonly<{
  workbook: Workbook;
  snapshot: CalculationSnapshot;
}>;

export const calculationSnapshot = (
  snapshot: CalculationSnapshot,
): CalculationSnapshot => Object.freeze(snapshot);

export const valueInSnapshot = (snapshot: CalculationSnapshot, id: CellId): CellValue =>
  snapshot.values.get(id) ?? BLANK;
