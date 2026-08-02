import {
  cellIdParts,
  isAddressWithin,
  type CellId,
} from "../../value-objects/cell-address.vo";
import type { DependencyGraph } from "../../derived/calculation/dependency-graph.derived";

/** Rangeを巨大なEdge集合へ展開せず、指定Cellに対する依存先を検索する。 */
export const dependentsOf = (
  graph: DependencyGraph,
  precedent: CellId,
): readonly CellId[] => {
  const direct = graph.directDependentsByCell.get(precedent) ?? [];
  const { worksheetId, address } = cellIdParts(precedent);
  const inRanges = graph.rangeDependents
    .filter(
      ({ range }) =>
        range.worksheetId === worksheetId &&
        isAddressWithin(address, range.start, range.end),
    )
    .map(({ dependent }) => dependent);
  return Object.freeze([...new Set([...direct, ...inRanges])].sort());
};
