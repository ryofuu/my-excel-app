import {
  cellIdParts,
  isAddressWithin,
  type CellId,
} from "../../value-objects/cell-address.vo";
import type {
  FormulaAdjacency,
  FormulaAnalysis,
} from "../../derived/calculation/dependency-graph.derived";

const formulaPrecedents = (
  analysis: FormulaAnalysis,
  formulas: ReadonlyMap<CellId, FormulaAnalysis>,
): readonly CellId[] => {
  const result = new Set<CellId>();
  for (const dependency of analysis.dependencies) {
    if (dependency.kind === "cell") {
      if (formulas.has(dependency.precedent)) {
        result.add(dependency.precedent);
      }
      continue;
    }
    for (const candidate of formulas.keys()) {
      const { worksheetId, address } = cellIdParts(candidate);
      if (
        worksheetId === dependency.worksheetId &&
        isAddressWithin(address, dependency.start, dependency.end)
      ) {
        result.add(candidate);
      }
    }
  }
  return [...result].sort();
};

/** 対象Formulaから、そのFormulaが参照する対象内のFormulaを引く隣接関係を作る。 */
export const createFormulaAdjacency = (
  formulaIds: ReadonlySet<CellId>,
  formulas: ReadonlyMap<CellId, FormulaAnalysis>,
): FormulaAdjacency => {
  const adjacency = new Map<CellId, readonly CellId[]>();
  for (const id of [...formulaIds].sort()) {
    const formula = formulas.get(id);
    if (formula === undefined) {
      continue;
    }
    adjacency.set(
      id,
      formulaPrecedents(formula, formulas).filter((precedent) => formulaIds.has(precedent)),
    );
  }
  return adjacency;
};
