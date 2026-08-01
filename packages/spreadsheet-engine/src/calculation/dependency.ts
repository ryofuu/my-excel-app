import { cellId, cellIdParts, isAddressWithin, type CellAddress, type CellId } from "../cell/address";
import type { FormulaSource } from "../cell/content";
import type { WorksheetId } from "../identifiers";
import type { Expression } from "../formula/ast";
import { parseFormula, type FormulaParseResult } from "../formula/parse";
import type { WorkbookRevision } from "../workbook/entities";

export type CellDependency = Readonly<{
  kind: "cell";
  precedent: CellId;
}>;

/** A range stays symbolic in the graph instead of being expanded into cells. */
export type RangeDependency = Readonly<{
  kind: "range";
  worksheetId: WorksheetId;
  start: CellAddress;
  end: CellAddress;
}>;

export type Dependency = CellDependency | RangeDependency;

export type RangeDependent = Readonly<{
  range: RangeDependency;
  dependent: CellId;
}>;

export type FormulaAnalysis = Readonly<{
  cellId: CellId;
  source: FormulaSource;
  parse: FormulaParseResult;
  dependencies: readonly Dependency[];
}>;

export type DependencyGraph = Readonly<{
  precedentsByCell: ReadonlyMap<CellId, readonly Dependency[]>;
  directDependentsByCell: ReadonlyMap<CellId, readonly CellId[]>;
  rangeDependents: readonly RangeDependent[];
}>;

export type CompiledRevision = Readonly<{
  formulas: ReadonlyMap<CellId, FormulaAnalysis>;
  graph: DependencyGraph;
}>;

const normalizeRange = (first: CellAddress, second: CellAddress): Readonly<{ start: CellAddress; end: CellAddress }> => ({
  start: {
    row: Math.min(first.row, second.row) as CellAddress["row"],
    column: Math.min(first.column, second.column) as CellAddress["column"],
  },
  end: {
    row: Math.max(first.row, second.row) as CellAddress["row"],
    column: Math.max(first.column, second.column) as CellAddress["column"],
  },
});

export const dependenciesInExpression = (
  worksheetId: WorksheetId,
  expression: Expression,
): readonly Dependency[] => {
  const dependencies: Dependency[] = [];
  const visit = (node: Expression): void => {
    switch (node.kind) {
      case "literal":
        return;
      case "reference":
        dependencies.push({ kind: "cell", precedent: cellId(worksheetId, node.reference.address) });
        return;
      case "range": {
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

/** Parses all formula cells and compiles their symbolic precedent/dependent graph. */
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

/** Finds dependents without materializing a range into a potentially huge edge set. */
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
