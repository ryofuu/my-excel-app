import type { CellId } from "../../../value-objects/cell-address.vo";
import type { DependencyGraph } from "../../../derived/calculation/dependency-graph.derived";
import { dependentsOf } from "./dependency-graph.service";

/** 変更Cellから、複数の依存グラフ上にある全Dependentを推移的に収集する。 */
export const collectDirtyCellIds = (
  changedCellIds: readonly CellId[],
  graphs: readonly DependencyGraph[],
): readonly CellId[] => {
  const dirty = new Set<CellId>(changedCellIds);
  const queue = [...changedCellIds].sort();
  while (queue.length > 0) {
    const precedent = queue.shift();
    if (precedent === undefined) {
      continue;
    }
    const dependents = new Set<CellId>(
      graphs.flatMap((graph) => dependentsOf(graph, precedent)),
    );
    for (const dependent of [...dependents].sort()) {
      if (!dirty.has(dependent)) {
        dirty.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return [...dirty].sort();
};
