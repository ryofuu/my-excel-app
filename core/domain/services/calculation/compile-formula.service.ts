import {
  cellAddress,
  cellId,
  cellIdParts,
  type CellAddress,
  type CellId,
} from "../../value-objects/cell-address.vo";
import type { FormulaSource } from "../../value-objects/cell-content.vo";
import type { WorksheetId } from "../../value-objects/identifiers.vo";
import type { ExpressionAST } from "../../value-objects/formula/formula.ast";
import { parseFormula } from "../../value-objects/formula/formula.parser";
import { tokenizeFormula } from "../../value-objects/formula/formula.tokenizer";
import type {
  Dependency,
  FormulaAnalysis,
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

/** ASTから、値を評価せずに記号的な参照関係だけを抽出する。 */
export const dependenciesInExpression = (
  worksheetId: WorksheetId,
  expression: ExpressionAST,
): readonly Dependency[] => {
  const dependencies: Dependency[] = [];
  const visit = (node: ExpressionAST): void => {
    switch (node.kind) {
      case "literal":
        return;
      case "reference":
        dependencies.push({
          kind: "cell",
          precedent: cellId(worksheetId, node.reference.address),
        });
        return;
      case "range": {
        // Rangeは全Cellへ展開せず、始点・終点を持つ記号的な依存として保持する。
        const range = normalizeRange(
          node.range.start.address,
          node.range.end.address,
        );
        dependencies.push({
          kind: "range",
          worksheetId,
          start: range.start,
          end: range.end,
        });
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

const uniqueDependencies = (
  dependencies: readonly Dependency[],
): readonly Dependency[] => {
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

/** FormulaSourceからToken・ExpressionAST・依存関係を順に導出する組み合わせ境界。 */
export const compileFormula = (
  id: CellId,
  source: FormulaSource,
): FormulaAnalysis => {
  const tokens = tokenizeFormula(source);
  const parse = parseFormula(tokens);
  const dependencies =
    parse.kind === "success"
      ? uniqueDependencies(
          dependenciesInExpression(
            cellIdParts(id).worksheetId,
            parse.ast,
          ),
        )
      : [];

  return {
    cellId: id,
    source,
    tokens,
    parse,
    dependencies,
  };
};
