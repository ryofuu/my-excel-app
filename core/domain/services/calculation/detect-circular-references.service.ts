import type { CellId } from "../../value-objects/cell-address.vo";
import type { FormulaAdjacency } from "../../derived/calculation/dependency-graph.derived";

/** Formulaの隣接関係を強連結成分へ分解し、循環参照だけを抽出する。 */
export const detectCircularReferences = (
  adjacency: FormulaAdjacency,
): readonly (readonly CellId[])[] => {
  let nextIndex = 0;
  const indices = new Map<CellId, number>();
  const lowLinks = new Map<CellId, number>();
  const stack: CellId[] = [];
  const onStack = new Set<CellId>();
  const components: CellId[][] = [];

  const visit = (node: CellId): void => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const precedent of adjacency.get(node) ?? []) {
      if (!indices.has(precedent)) {
        visit(precedent);
        const ownLowLink = lowLinks.get(node);
        const precedentLowLink = lowLinks.get(precedent);
        if (ownLowLink !== undefined && precedentLowLink !== undefined) {
          lowLinks.set(node, Math.min(ownLowLink, precedentLowLink));
        }
      } else if (onStack.has(precedent)) {
        const ownLowLink = lowLinks.get(node);
        const precedentIndex = indices.get(precedent);
        if (ownLowLink !== undefined && precedentIndex !== undefined) {
          lowLinks.set(node, Math.min(ownLowLink, precedentIndex));
        }
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) {
      return;
    }

    const component: CellId[] = [];
    while (true) {
      const member = stack.pop();
      if (member === undefined) {
        break;
      }
      onStack.delete(member);
      component.push(member);
      if (member === node) {
        break;
      }
    }
    components.push(component.sort());
  };

  for (const node of [...adjacency.keys()].sort()) {
    if (!indices.has(node)) {
      visit(node);
    }
  }

  return components
    .filter((component) => {
      if (component.length > 1) {
        return true;
      }
      const node = component[0];
      return node !== undefined && (adjacency.get(node) ?? []).includes(node);
    })
    .sort((left, right) => (left[0] ?? "").localeCompare(right[0] ?? ""));
};
