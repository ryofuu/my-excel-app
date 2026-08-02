import {
  cellAddress,
  cellId,
  cellIdParts,
  isAddressWithin,
  type CellId,
} from "../../value-objects/cell-address.vo";
import {
  booleanLiteral,
  numberLiteral,
  textLiteral,
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
import type {
  FormulaAnalysis,
  RangeDependency,
} from "../../derived/calculation/dependency-graph.derived";

type RangeValue = Readonly<{
  kind: "range-value";
  range: RangeDependency;
}>;

type EvaluationResult = CellValue | RangeValue;

const valueAt = (values: ReadonlyMap<CellId, CellValue>, id: CellId): CellValue =>
  values.get(id) ?? BLANK;

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

const compare = (
  left: CellValue,
  right: CellValue,
  operator: BinaryOperator,
  origin: CellId,
): CellValue => {
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
      const operand = scalarNumber(
        evaluateExpression(expression.operand, ownerWorksheetId, owner, values),
        owner,
      );
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

/** Compile済みFormulaを、確定済みのPrecedent値から1つのCellValueへ評価する。 */
export const evaluateFormula = (
  formula: FormulaAnalysis,
  values: ReadonlyMap<CellId, CellValue>,
): CellValue => {
  const owner = formula.cellId;
  if (formula.parse.kind === "error") {
    return errorValue("parse", owner, formula.parse.error.message);
  }
  const worksheetId = cellIdParts(owner).worksheetId;
  const evaluated = evaluateExpression(formula.parse.ast, worksheetId, owner, values);
  return evaluated.kind === "range-value"
    ? errorValue("type", owner, "A range cannot be used as a cell value.")
    : evaluated;
};
