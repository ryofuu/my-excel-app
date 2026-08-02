import {
  cellAddress,
  cellId,
  cellIdParts,
  isAddressWithin,
  type CellAddress,
  type CellId,
} from "../../value-objects/cell-address.vo";
import type { WorksheetId } from "../../value-objects/identifiers.vo";
import type { Expression } from "../../value-objects/formula/formula.ast";
import { parseFormula } from "../../value-objects/formula/formula.parser";
import type { WorkbookRevision } from "../../entities/workbook-revision.entity";
import type {
  CompiledRevision,
  Dependency,
  DependencyGraph,
  FormulaAnalysis,
  RangeDependent,
} from "../../derived/calculation/dependency-graph.derived";

const normalizeRange = (
  first: CellAddress,
  second: CellAddress,
): Readonly<{ start: CellAddress; end: CellAddress }> => ({
  start: cellAddress(
    Math.min(first.row, second.row),
    Math.min(first.column, second.column),
  ),
  end: cellAddress(
    Math.max(first.row, second.row),
    Math.max(first.column, second.column),
  ),
});

export const dependenciesInExpression = (
  worksheetId: WorksheetId,
  expression: Expression,
): readonly Dependency[] => {
  const dependencies: Dependency[] = [];
  // AST から値そのものではなく参照関係だけを抽出し、評価処理と分離する。
  const visit = (node: Expression): void => {
    switch (node.kind) {
      case "literal":
        return;
      case "reference":
        dependencies.push({ kind: "cell", precedent: cellId(worksheetId, node.reference.address) });
        return;
      case "range": {
        // Range は全 Cell へ展開せず、始点・終点を持つ記号的な依存として保持する。
        const range = normalizeRange(node.range.start.address, node.range.end.address);
        dependencies.push({ kind: "range", worksheetId, start: range.start, end: range.end });
        return;
      }
      case "unary":
        visit(node.operand);
        return;
      case "binary":
        visit(node.left);
        visit(node.right);
        return;
      case "call":
        node.arguments.forEach(visit);
        return;
    }
  };
  visit(expression);
  return dependencies;
};

const uniqueDependencies = (dependencies: readonly Dependency[]): readonly Dependency[] => {
  const known = new Set<string>();
  return dependencies.filter((dependency) => {
    const key =
      dependency.kind === "cell"
        ? `cell:${dependency.precedent}`
        : `range:${dependency.worksheetId}:${dependency.start.row}:${dependency.start.column}:${dependency.end.row}:${dependency.end.column}`;
    if (known.has(key)) {
      return false;
    }
    known.add(key);
    return true;
  });
};

/** 全 Formula Cell を解析し、参照元・依存先を表す記号的な依存グラフを構築する。 */
export const compileRevision = (revision: WorkbookRevision): CompiledRevision => {
  const formulas = new Map<CellId, FormulaAnalysis>();
  const mutablePrecedents = new Map<CellId, readonly Dependency[]>();
  const mutableDirectDependents = new Map<CellId, Set<CellId>>();
  const rangeDependents: RangeDependent[] = [];

  for (const [id, cell] of revision.cells) {
    if (cell.content?.kind !== "formula") {
      continue;
    }
    const worksheetId = cellIdParts(id).worksheetId;
    const parse = parseFormula(cell.content.source);
    // Parse Error も FormulaAnalysis に残す。依存関係だけ空にし、再計算時に CellValue の Error へ変換する。
    const dependencies =
      parse.kind === "success" ? uniqueDependencies(dependenciesInExpression(worksheetId, parse.expression)) : [];
    const analysis: FormulaAnalysis = {
      cellId: id,
      source: cell.content.source,
      parse,
      dependencies,
    };
    formulas.set(id, analysis);
    mutablePrecedents.set(id, dependencies);

    // 参照元から依存先を引ける逆向き Index も同時に構築し、dirty の伝播に使う。
    for (const dependency of dependencies) {
      if (dependency.kind === "cell") {
        const dependents = mutableDirectDependents.get(dependency.precedent) ?? new Set<CellId>();
        dependents.add(id);
        mutableDirectDependents.set(dependency.precedent, dependents);
      } else {
        rangeDependents.push({ range: dependency, dependent: id });
      }
    }
  }

  const directDependentsByCell = new Map<CellId, readonly CellId[]>();
  for (const [precedent, dependents] of mutableDirectDependents) {
    directDependentsByCell.set(precedent, Object.freeze([...dependents].sort()));
  }

  return {
    formulas,
    graph: {
      precedentsByCell: mutablePrecedents,
      directDependentsByCell,
      rangeDependents: Object.freeze([...rangeDependents]),
    },
  };
};

/** Range を巨大な Edge 集合へ展開せず、指定 Cell に対する依存先を検索する。 */
export const dependentsOf = (graph: DependencyGraph, precedent: CellId): readonly CellId[] => {
  const direct = graph.directDependentsByCell.get(precedent) ?? [];
  const { worksheetId, address } = cellIdParts(precedent);
  const inRanges = graph.rangeDependents
    .filter(
      ({ range }) =>
        range.worksheetId === worksheetId && isAddressWithin(address, range.start, range.end),
    )
    .map(({ dependent }) => dependent);
  return Object.freeze([...new Set([...direct, ...inRanges])].sort());
};
