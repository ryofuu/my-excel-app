import type { CellId } from "../../../value-objects/cell-address.vo";
import type { FormulaAdjacency } from "../../../derived/calculation/dependency-graph.derived";

/**
 * Formulaを、参照されるCellから参照するFormulaの順に並べる。
 *
 * Precedentは「Formulaが参照するCell」、Dependentは「そのCellを使うFormula」。
 * たとえば B1=A1+1、C1=A1+2、D1=B1+C1 の場合:
 *
 * 値が流れる向き（そのまま計算順）
 *
 *          ┌──> B1 ──┐
 *   A1 ────┤         ├──> D1
 *          └──> C1 ──┘
 *
 * FormulaAdjacencyは「Formula -> そのFormulaが参照するFormula Cell IDs」を持つ。
 *
 *   A1 -> []
 *   B1 -> [A1]
 *   C1 -> [A1]
 *   D1 -> [B1, C1]
 */
export const topologicallySortFormulas = (
  formulaAdjacency: FormulaAdjacency,
): readonly CellId[] => {
  const formulaCellIds = [...formulaAdjacency.keys()].sort();
  const remainingPrecedentCountByFormulaCellId = new Map<CellId, number>();
  const dependentCellIdsByPrecedentCellId = new Map<CellId, Set<CellId>>();

  // 各Formulaの未処理参照先数と、参照先Cellからそれを使うFormulaへの逆引きを作る。
  for (const formulaCellId of formulaCellIds) {
    const precedentCellIds = formulaAdjacency.get(formulaCellId) ?? [];
    remainingPrecedentCountByFormulaCellId.set(
      formulaCellId,
      precedentCellIds.length,
    );
    for (const precedentCellId of precedentCellIds) {
      const dependentCellIds =
        dependentCellIdsByPrecedentCellId.get(precedentCellId) ?? new Set<CellId>();
      dependentCellIds.add(formulaCellId);
      dependentCellIdsByPrecedentCellId.set(precedentCellId, dependentCellIds);
    }
  }

  // 先に計算すべき参照先がなく、すぐに順序を確定できるFormulaを待機させる。
  const readyFormulaCellIds = formulaCellIds
    .filter(
      (formulaCellId) =>
        remainingPrecedentCountByFormulaCellId.get(formulaCellId) === 0,
    )
    .sort();
  const sortedFormulaCellIds: CellId[] = [];

  // 順序を確定したFormulaを取り出し、後続Formulaの未処理Precedent数を減らす。
  while (readyFormulaCellIds.length > 0) {
    const formulaCellId = readyFormulaCellIds.shift();
    if (formulaCellId === undefined) {
      continue;
    }
    sortedFormulaCellIds.push(formulaCellId);
    const dependentCellIds = [
      ...(dependentCellIdsByPrecedentCellId.get(formulaCellId) ?? []),
    ].sort();
    for (const dependentCellId of dependentCellIds) {
      const remainingPrecedentCount =
        (remainingPrecedentCountByFormulaCellId.get(dependentCellId) ?? 0) - 1;
      remainingPrecedentCountByFormulaCellId.set(
        dependentCellId,
        remainingPrecedentCount,
      );
      if (remainingPrecedentCount === 0) {
        readyFormulaCellIds.push(dependentCellId);
        readyFormulaCellIds.sort();
      }
    }
  }

  // 全Formulaの順序を確定できなければ、隣接関係に循環が含まれている。
  if (sortedFormulaCellIds.length !== formulaCellIds.length) {
    throw new Error("Formula adjacency could not be topologically sorted.");
  }
  return sortedFormulaCellIds;
};
