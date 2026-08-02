import type { CellId } from "../../value-objects/cell-address.vo";
import type { WorkbookRevision } from "../../entities/workbook-revision.entity";
import type {
  CompiledRevision,
  Dependency,
  FormulaAnalysis,
  RangeDependent,
} from "../../derived/calculation/dependency-graph.derived";
import { compileFormula } from "./compile-formula.service";

/** 全Formula CellをCompileし、参照元・依存先を引けるGraphへまとめる。 */
export const compileRevision = (
  revision: WorkbookRevision,
): CompiledRevision => {
  const formulas = new Map<CellId, FormulaAnalysis>();
  const precedentsByCell = new Map<CellId, readonly Dependency[]>();
  const mutableDirectDependents = new Map<CellId, Set<CellId>>();
  const rangeDependents: RangeDependent[] = [];

  for (const [id, cell] of revision.cells) {
    if (cell.content?.kind !== "formula") {
      continue;
    }

    const analysis = compileFormula(id, cell.content.source);
    formulas.set(id, analysis);
    precedentsByCell.set(id, analysis.dependencies);

    // 参照元から依存先を引ける逆向きIndexを構築し、dirtyの伝播に使う。
    for (const dependency of analysis.dependencies) {
      if (dependency.kind === "cell") {
        const dependents =
          mutableDirectDependents.get(dependency.precedent) ??
          new Set<CellId>();
        dependents.add(id);
        mutableDirectDependents.set(dependency.precedent, dependents);
      } else {
        rangeDependents.push({ range: dependency, dependent: id });
      }
    }
  }

  const directDependentsByCell = new Map<CellId, readonly CellId[]>();
  for (const [precedent, dependents] of mutableDirectDependents) {
    directDependentsByCell.set(
      precedent,
      Object.freeze([...dependents].sort()),
    );
  }

  return {
    formulas,
    graph: {
      precedentsByCell,
      directDependentsByCell,
      rangeDependents: Object.freeze([...rangeDependents]),
    },
  };
};
