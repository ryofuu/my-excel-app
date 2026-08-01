import type { CellId } from "../../value-objects/cell-address.vo";

/** Explains the work performed to derive one CalculationSnapshot. */
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
