import type { CellId } from "../../../value-objects/cell-address.vo";
import type { FormulaAdjacency } from "../../../derived/calculation/dependency-graph.derived";

/** 循環参照を含まないFormulaを、PrecedentからDependentの順に並べる。 */
export const topologicallySortFormulas = (
  adjacency: FormulaAdjacency,
): readonly CellId[] => {
  const active = [...adjacency.keys()].sort();
  const remainingPrecedents = new Map<CellId, number>();
  const dependents = new Map<CellId, Set<CellId>>();

  for (const formula of active) {
    const precedents = adjacency.get(formula) ?? [];
    remainingPrecedents.set(formula, precedents.length);
    for (const precedent of precedents) {
      const list = dependents.get(precedent) ?? new Set<CellId>();
      list.add(formula);
      dependents.set(precedent, list);
    }
  }

  const ready = active.filter((id) => remainingPrecedents.get(id) === 0).sort();
  const result: CellId[] = [];
  while (ready.length > 0) {
    const formula = ready.shift();
    if (formula === undefined) {
      continue;
    }
    result.push(formula);
    for (const dependent of [...(dependents.get(formula) ?? [])].sort()) {
      const remaining = (remainingPrecedents.get(dependent) ?? 0) - 1;
      remainingPrecedents.set(dependent, remaining);
      if (remaining === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  if (result.length !== active.length) {
    throw new Error("Formula adjacency could not be topologically sorted.");
  }
  return result;
};
