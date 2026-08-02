import type { CellId } from "../../value-objects/cell-address.vo";

/** 1つの CalculationSnapshot を導出するために行った計算処理の記録。 */
export type CalculationTrace = Readonly<{
  dirtyCellIds: readonly CellId[];
  evaluationOrder: readonly CellId[];
  cycles: readonly (readonly CellId[])[];
}>;

export const calculationTrace = (trace: CalculationTrace): CalculationTrace =>
  Object.freeze({
    dirtyCellIds: Object.freeze([...trace.dirtyCellIds]),
    evaluationOrder: Object.freeze([...trace.evaluationOrder]),
    cycles: Object.freeze(trace.cycles.map((cycle) => Object.freeze([...cycle]))),
  });
