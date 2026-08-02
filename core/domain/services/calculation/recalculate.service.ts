import {
  cellId,
  cellAddress,
  cellIdParts,
  isAddressWithin,
  type CellId,
} from "../../value-objects/cell-address.vo";
import {
  booleanLiteral,
  cellContentEquals,
  numberLiteral,
  textLiteral,
  type CellContent,
} from "../../value-objects/cell-content.vo";
import {
  BLANK,
  errorValue,
  isErrorValue,
  literalValue,
  type CellError,
  type CellValue,
} from "../../value-objects/cell-value.vo";
import type { BinaryOperator, ExpressionAST } from "../../value-objects/formula/formula.ast";
import type { WorkbookRevision } from "../../entities/workbook-revision.entity";
import type { Workbook } from "../../entities/workbook.entity";
import {
  calculationSnapshot,
  type CalculationSnapshot,
  type PreviousCalculation,
} from "../../derived/calculation/calculation-snapshot.derived";
import { calculationTrace } from "../../derived/calculation/calculation-trace.derived";
import type {
  CompiledRevision,
  Dependency,
  DependencyGraph,
  FormulaAdjacency,
  FormulaAnalysis,
  RangeDependency,
} from "../../derived/calculation/dependency-graph.derived";
import { compileRevision } from "./compile-revision.service";
import { detectCircularReferences } from "./detect-circular-references.service";
import { dependentsOf } from "./dependency-graph.service";
import { topologicallySortFormulas } from "./topologically-sort-formulas.service";

type RangeValue = Readonly<{
  kind: "range-value";
  range: RangeDependency;
}>;

type EvaluationResult = CellValue | RangeValue;

const contentAt = (revision: WorkbookRevision, id: CellId): CellContent | null =>
  revision.cells.get(id)?.content ?? null;

const valueAt = (values: ReadonlyMap<CellId, CellValue>, id: CellId): CellValue =>
  values.get(id) ?? BLANK;

const changedCellIds = (previous: WorkbookRevision, next: WorkbookRevision): readonly CellId[] => {
  const ids = new Set<CellId>([...previous.cells.keys(), ...next.cells.keys()]);
  return [...ids]
    .filter((id) => !cellContentEquals(contentAt(previous, id), contentAt(next, id)))
    .sort();
};

const allContentCellIds = (revision: WorkbookRevision): readonly CellId[] =>
  [...revision.cells]
    .filter(([, cell]) => cell.content !== null)
    .map(([id]) => id)
    .sort();

const dirtyClosure = (
  changed: readonly CellId[],
  currentGraph: DependencyGraph,
  previousGraph?: DependencyGraph,
): readonly CellId[] => {
  const dirty = new Set<CellId>(changed);
  const queue = [...changed].sort();
  while (queue.length > 0) {
    const precedent = queue.shift();
    if (precedent === undefined) {
      continue;
    }
    const dependents = new Set<CellId>([
      ...dependentsOf(currentGraph, precedent),
      ...(previousGraph === undefined ? [] : dependentsOf(previousGraph, precedent)),
    ]);
    for (const dependent of [...dependents].sort()) {
      if (!dirty.has(dependent)) {
        dirty.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return [...dirty].sort();
};

const formulaPrecedents = (
  formulaId: CellId,
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
  // formulaId は呼び出し側で対象を明示するために残す。自己参照は循環検出の対象なので除外しない。
  void formulaId;
  return [...result].sort();
};

const formulaAdjacency = (
  dirtyFormulaIds: ReadonlySet<CellId>,
  formulas: ReadonlyMap<CellId, FormulaAnalysis>,
): FormulaAdjacency => {
  const adjacency = new Map<CellId, readonly CellId[]>();
  for (const id of [...dirtyFormulaIds].sort()) {
    const formula = formulas.get(id);
    if (formula === undefined) {
      continue;
    }
    adjacency.set(
      id,
      formulaPrecedents(id, formula, formulas).filter((precedent) => dirtyFormulaIds.has(precedent)),
    );
  }
  return adjacency;
};

const excludeFormulaIds = (
  adjacency: FormulaAdjacency,
  excluded: ReadonlySet<CellId>,
): FormulaAdjacency => {
  const remaining = new Map<CellId, readonly CellId[]>();
  for (const [formulaId, precedents] of adjacency) {
    if (!excluded.has(formulaId)) {
      remaining.set(
        formulaId,
        precedents.filter((precedent) => !excluded.has(precedent)),
      );
    }
  }
  return remaining;
};

const errorFromResult = (result: EvaluationResult): CellError | null =>
  result.kind === "range-value" ? null : isErrorValue(result) ? result : null;

const scalarNumber = (result: EvaluationResult, origin: CellId): number | CellError => {
  const error = errorFromResult(result);
  if (error !== null) {
    return error;
  }
  if (result.kind === "number") {
    return result.value;
  }
  return errorValue("type", origin, "This operation requires numeric operands.");
};

const scalarText = (result: EvaluationResult, origin: CellId): string | CellError => {
  const error = errorFromResult(result);
  if (error !== null) {
    return error;
  }
  if (result.kind === "text") {
    return result.value;
  }
  return errorValue("type", origin, "Text concatenation requires text operands.");
};

const compare = (left: CellValue, right: CellValue, operator: BinaryOperator, origin: CellId): CellValue => {
  if (isErrorValue(left)) {
    return left;
  }
  if (isErrorValue(right)) {
    return right;
  }
  if (left.kind === "blank" || right.kind === "blank" || left.kind !== right.kind) {
    return errorValue("type", origin, "Comparison requires two values of the same non-blank type.");
  }
  const ordering = left.value === right.value ? 0 : left.value < right.value ? -1 : 1;
  const value =
    operator === "="
      ? ordering === 0
      : operator === "<>"
        ? ordering !== 0
        : operator === "<"
          ? ordering < 0
          : operator === "<="
            ? ordering <= 0
            : operator === ">"
              ? ordering > 0
              : ordering >= 0;
  return literalValue(booleanLiteral(value));
};

const rangeValues = (
  range: RangeDependency,
  values: ReadonlyMap<CellId, CellValue>,
): readonly CellValue[] => {
  const valuesInRange: CellValue[] = [];
  for (const [id, value] of values) {
    const { worksheetId, address } = cellIdParts(id);
    if (worksheetId === range.worksheetId && isAddressWithin(address, range.start, range.end)) {
      valuesInRange.push(value);
    }
  }
  return valuesInRange;
};

const evaluateSum = (
  arguments_: readonly ExpressionAST[],
  ownerWorksheetId: ReturnType<typeof cellIdParts>["worksheetId"],
  owner: CellId,
  values: ReadonlyMap<CellId, CellValue>,
): CellValue => {
  let sum = 0;
  for (const argument of arguments_) {
    const result = evaluateExpression(argument, ownerWorksheetId, owner, values);
    const error = errorFromResult(result);
    if (error !== null) {
      return error;
    }
    // Range は依存グラフでは記号のまま保ち、値が必要になる関数評価時だけ展開する。
    const candidates = result.kind === "range-value" ? rangeValues(result.range, values) : [result];
    for (const value of candidates) {
      if (isErrorValue(value)) {
        return value;
      }
      if (value.kind === "blank") {
        continue;
      }
      if (value.kind !== "number") {
        return errorValue("type", owner, "SUM accepts numbers and blanks only.");
      }
      sum += value.value;
      if (!Number.isFinite(sum)) {
        return errorValue("type", owner, "SUM produced a numeric value outside the supported range.");
      }
    }
  }
  return literalValue(numberLiteral(sum));
};

const evaluateExpression = (
  expression: ExpressionAST,
  ownerWorksheetId: ReturnType<typeof cellIdParts>["worksheetId"],
  owner: CellId,
  values: ReadonlyMap<CellId, CellValue>,
): EvaluationResult => {
  switch (expression.kind) {
    case "literal":
      return literalValue(expression.literal);
    case "reference":
      // Formula は依存順に評価されるため、参照先の値はこの Map に確定済みである。
      return valueAt(values, cellId(ownerWorksheetId, expression.reference.address));
    case "range":
      // Range は単独の CellValue ではない。SUM など Range 対応の呼び出し側まで Marker のまま渡す。
      return {
        kind: "range-value",
        range: {
          kind: "range",
          worksheetId: ownerWorksheetId,
          start: cellAddress(
            Math.min(
              expression.range.start.address.row,
              expression.range.end.address.row,
            ),
            Math.min(
              expression.range.start.address.column,
              expression.range.end.address.column,
            ),
          ),
          end: cellAddress(
            Math.max(
              expression.range.start.address.row,
              expression.range.end.address.row,
            ),
            Math.max(
              expression.range.start.address.column,
              expression.range.end.address.column,
            ),
          ),
        },
      };
    case "unary": {
      const operand = scalarNumber(evaluateExpression(expression.operand, ownerWorksheetId, owner, values), owner);
      if (typeof operand !== "number") {
        return operand;
      }
      return literalValue(
        numberLiteral(expression.operator === "-" ? -operand : operand),
      );
    }
    case "binary": {
      const left = evaluateExpression(expression.left, ownerWorksheetId, owner, values);
      // 参照元の Error は演算せず、その Formula の結果として伝播させる。
      const leftError = errorFromResult(left);
      if (leftError !== null) {
        return leftError;
      }
      const right = evaluateExpression(expression.right, ownerWorksheetId, owner, values);
      const rightError = errorFromResult(right);
      if (rightError !== null) {
        return rightError;
      }
      if (["=", "<>", "<", "<=", ">", ">="].includes(expression.operator)) {
        if (left.kind === "range-value" || right.kind === "range-value") {
          return errorValue("type", owner, "A range cannot be used as a scalar comparison.");
        }
        return compare(left, right, expression.operator, owner);
      }
      if (expression.operator === "&") {
        const leftText = scalarText(left, owner);
        if (typeof leftText !== "string") {
          return leftText;
        }
        const rightText = scalarText(right, owner);
        if (typeof rightText !== "string") {
          return rightText;
        }
        return literalValue(textLiteral(leftText + rightText));
      }
      const leftNumber = scalarNumber(left, owner);
      if (typeof leftNumber !== "number") {
        return leftNumber;
      }
      const rightNumber = scalarNumber(right, owner);
      if (typeof rightNumber !== "number") {
        return rightNumber;
      }
      if (expression.operator === "/" && rightNumber === 0) {
        return errorValue("division-by-zero", owner, "Division by zero.");
      }
      const value =
        expression.operator === "+"
          ? leftNumber + rightNumber
          : expression.operator === "-"
            ? leftNumber - rightNumber
            : expression.operator === "*"
              ? leftNumber * rightNumber
              : leftNumber / rightNumber;
      if (!Number.isFinite(value)) {
        return errorValue("type", owner, "This operation produced a numeric value outside the supported range.");
      }
      return literalValue(numberLiteral(value));
    }
    case "call":
      if (expression.name === "SUM") {
        return evaluateSum(expression.arguments, ownerWorksheetId, owner, values);
      }
      return errorValue("unknown-function", owner, `Unknown function: ${expression.name}.`);
  }
};

const assignDirectInputValues = (
  revision: WorkbookRevision,
  values: Map<CellId, CellValue>,
  changed: readonly CellId[],
  full: boolean,
): void => {
  const targetIds = full ? allContentCellIds(revision) : changed;
  for (const id of targetIds) {
    const content = contentAt(revision, id);
    if (content === null) {
      values.delete(id);
    } else if (content.kind === "literal") {
      values.set(id, literalValue(content.literal));
    } else {
      // Formula は後続の依存順評価で入れ直すため、過去の計算値を先に捨てる。
      values.delete(id);
    }
  }
};

const fullRecalculation = (
  workbook: Workbook,
  previous?: PreviousCalculation,
): boolean =>
  previous === undefined ||
  previous.workbook.id !== workbook.id ||
  previous.snapshot.sourceRevision !== previous.workbook.revision.number;

/**
 * 1つの不変な WorkbookRevision を再計算する。
 * 前回状態があれば未変更値を再利用しつつ、変更 Cell の全依存先を再計算対象にする。
 */
export const recalculate = (
  workbook: Workbook,
  previous?: PreviousCalculation,
): CalculationSnapshot => {
  const revision = workbook.revision;
  // Formula の解析結果と依存グラフを先に構築し、値の評価順をデータ構造として確定する。
  const compiled: CompiledRevision = compileRevision(revision);
  const full = fullRecalculation(workbook, previous);
  const changed =
    full || previous === undefined
      ? allContentCellIds(revision)
      : changedCellIds(previous.workbook.revision, revision);
  const dirtyCellIds = full
    ? changed
    : dirtyClosure(changed, compiled.graph, previous?.snapshot.graph);
  // 依存関係が変わった Formula も拾えるように、現在と前回の両グラフから dirty を伝播する。
  const dirtyFormulaIds = new Set(
    dirtyCellIds.filter((id) => compiled.formulas.has(id)),
  );
  const values = new Map<CellId, CellValue>(full ? [] : previous?.snapshot.values ?? []);
  assignDirectInputValues(revision, values, changed, full);

  const adjacency = formulaAdjacency(dirtyFormulaIds, compiled.formulas);
  // 循環成分を先にエラーへ確定し、残りだけを依存元から依存先の順に評価する。
  const cycles = detectCircularReferences(adjacency);
  const cyclicFormulaIds = new Set<CellId>(cycles.flat());
  const evaluableAdjacency = excludeFormulaIds(adjacency, cyclicFormulaIds);
  const evaluationOrder: CellId[] = [];

  for (const component of cycles) {
    for (const formulaId of component) {
      values.set(
        formulaId,
        errorValue("circular-reference", formulaId, "Formula participates in a circular reference."),
      );
      evaluationOrder.push(formulaId);
    }
  }

  for (const formulaId of topologicallySortFormulas(evaluableAdjacency)) {
    const formula = compiled.formulas.get(formulaId);
    if (formula === undefined) {
      continue;
    }
    if (formula.parse.kind === "error") {
      values.set(formulaId, errorValue("parse", formulaId, formula.parse.error.message));
    } else {
      const worksheetId = cellIdParts(formulaId).worksheetId;
      const evaluated = evaluateExpression(formula.parse.ast, worksheetId, formulaId, values);
      if (evaluated.kind === "range-value") {
        values.set(formulaId, errorValue("type", formulaId, "A range cannot be used as a cell value."));
      } else {
        values.set(formulaId, evaluated);
      }
    }
    evaluationOrder.push(formulaId);
  }

  // 計算結果は正本へ書き戻さず、元 Revision を指す派生 Snapshot として返す。
  return calculationSnapshot({
    sourceRevision: revision.number,
    values,
    formulas: compiled.formulas,
    graph: compiled.graph,
    trace: calculationTrace({
      dirtyCellIds,
      evaluationOrder,
      cycles,
    }),
  });
};
