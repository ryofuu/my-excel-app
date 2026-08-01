import type { FormulaSource } from "../cell-content.vo";
import { booleanLiteral, numberLiteral, textLiteral } from "../cell-content.vo";
import type { BinaryOperator, CellReference, Expression, UnaryOperator } from "./formula.ast";
import { tokenizeFormula, type FormulaToken } from "./formula.tokenizer";

export type FormulaParseError = Readonly<{
  message: string;
  start: number;
  end: number;
}>;

export type FormulaParseResult =
  | Readonly<{
      kind: "success";
      source: FormulaSource | string;
      tokens: readonly FormulaToken[];
      expression: Expression;
    }>
  | Readonly<{
      kind: "error";
      source: FormulaSource | string;
      tokens: readonly FormulaToken[];
      error: FormulaParseError;
    }>;

type ParseState = {
  index: number;
  readonly tokens: readonly FormulaToken[];
};

type ParseStep = Readonly<{ kind: "success"; expression: Expression }> | Readonly<{ kind: "error"; error: FormulaParseError }>;

const current = (state: ParseState): FormulaToken =>
  state.tokens[state.index] ?? state.tokens[state.tokens.length - 1] ?? {
    kind: "eof",
    lexeme: "",
    start: 0,
    end: 0,
  };

const advance = (state: ParseState): FormulaToken => {
  const token = current(state);
  if (token.kind !== "eof") {
    state.index += 1;
  }
  return token;
};

const parseError = (token: FormulaToken, message: string): ParseStep => ({
  kind: "error",
  error: { message, start: token.start, end: token.end },
});

const isOperator = (token: FormulaToken, ...operators: readonly string[]): boolean =>
  token.kind === "operator" && operators.includes(token.lexeme);

const parsePrimary = (state: ParseState): ParseStep => {
  const token = advance(state);
  switch (token.kind) {
    case "number":
      return { kind: "success", expression: { kind: "literal", literal: numberLiteral(token.value) } };
    case "text":
      return { kind: "success", expression: { kind: "literal", literal: textLiteral(token.value) } };
    case "boolean":
      return { kind: "success", expression: { kind: "literal", literal: booleanLiteral(token.value) } };
    case "reference": {
      const rangeStart = token.reference;
      if (current(state).kind === "colon") {
        advance(state);
        const end = advance(state);
        if (end.kind !== "reference") {
          return parseError(end, "A range must end with a cell reference.");
        }
        return {
          kind: "success",
          expression: { kind: "range", range: { start: rangeStart, end: end.reference } },
        };
      }
      return { kind: "success", expression: { kind: "reference", reference: rangeStart } };
    }
    case "identifier": {
      if (current(state).kind !== "left-paren") {
        return parseError(current(state), `Expected '(' after function ${token.lexeme}.`);
      }
      advance(state);
      const arguments_: Expression[] = [];
      if (current(state).kind !== "right-paren") {
        while (true) {
          const argument = parseComparison(state);
          if (argument.kind === "error") {
            return argument;
          }
          arguments_.push(argument.expression);
          if (current(state).kind !== "comma") {
            break;
          }
          advance(state);
          if (current(state).kind === "right-paren") {
            return parseError(current(state), "A function argument is required after ','.");
          }
        }
      }
      if (current(state).kind !== "right-paren") {
        return parseError(current(state), `Expected ')' after function ${token.lexeme}.`);
      }
      advance(state);
      return { kind: "success", expression: { kind: "call", name: token.name, arguments: arguments_ } };
    }
    case "left-paren": {
      const expression = parseComparison(state);
      if (expression.kind === "error") {
        return expression;
      }
      if (current(state).kind !== "right-paren") {
        return parseError(current(state), "Expected ')'.");
      }
      advance(state);
      return expression;
    }
    case "invalid":
      return parseError(token, token.message);
    case "eof":
      return parseError(token, "Expected an expression.");
    default:
      return parseError(token, `Expected an expression, found '${token.lexeme}'.`);
  }
};

const parseUnary = (state: ParseState): ParseStep => {
  const token = current(state);
  if (isOperator(token, "+", "-")) {
    advance(state);
    const operand = parseUnary(state);
    if (operand.kind === "error") {
      return operand;
    }
    return {
      kind: "success",
      expression: { kind: "unary", operator: token.lexeme as UnaryOperator, operand: operand.expression },
    };
  }
  return parsePrimary(state);
};

const parseMultiplicative = (state: ParseState): ParseStep => {
  let left = parseUnary(state);
  while (left.kind === "success" && isOperator(current(state), "*", "/")) {
    const operator = advance(state);
    const right = parseUnary(state);
    if (right.kind === "error") {
      return right;
    }
    left = {
      kind: "success",
      expression: {
        kind: "binary",
        operator: operator.lexeme as BinaryOperator,
        left: left.expression,
        right: right.expression,
      },
    };
  }
  return left;
};

const parseAdditive = (state: ParseState): ParseStep => {
  let left = parseMultiplicative(state);
  while (left.kind === "success" && isOperator(current(state), "+", "-")) {
    const operator = advance(state);
    const right = parseMultiplicative(state);
    if (right.kind === "error") {
      return right;
    }
    left = {
      kind: "success",
      expression: {
        kind: "binary",
        operator: operator.lexeme as BinaryOperator,
        left: left.expression,
        right: right.expression,
      },
    };
  }
  return left;
};

const parseConcatenation = (state: ParseState): ParseStep => {
  let left = parseAdditive(state);
  while (left.kind === "success" && isOperator(current(state), "&")) {
    advance(state);
    const right = parseAdditive(state);
    if (right.kind === "error") {
      return right;
    }
    left = { kind: "success", expression: { kind: "binary", operator: "&", left: left.expression, right: right.expression } };
  }
  return left;
};

const parseComparison = (state: ParseState): ParseStep => {
  let left = parseConcatenation(state);
  while (left.kind === "success" && isOperator(current(state), "=", "<>", "<", "<=", ">", ">=")) {
    const operator = advance(state);
    const right = parseConcatenation(state);
    if (right.kind === "error") {
      return right;
    }
    left = {
      kind: "success",
      expression: {
        kind: "binary",
        operator: operator.lexeme as BinaryOperator,
        left: left.expression,
        right: right.expression,
      },
    };
  }
  return left;
};

/** Parses a FormulaSource while preserving invalid source text and inspector tokens. */
export const parseFormula = (source: FormulaSource | string): FormulaParseResult => {
  const tokens = tokenizeFormula(source);
  const state: ParseState = { index: 0, tokens };
  const expression = parseComparison(state);
  if (expression.kind === "error") {
    return { kind: "error", source, tokens, error: expression.error };
  }

  const tail = current(state);
  if (tail.kind !== "eof") {
    return {
      kind: "error",
      source,
      tokens,
      error: { message: `Unexpected token '${tail.lexeme}'.`, start: tail.start, end: tail.end },
    };
  }

  return { kind: "success", source, tokens, expression: expression.expression };
};

export const referencesInExpression = (expression: Expression): readonly CellReference[] => {
  const references: CellReference[] = [];
  const visit = (node: Expression): void => {
    switch (node.kind) {
      case "reference":
        references.push(node.reference);
        return;
      case "range":
        references.push(node.range.start, node.range.end);
        return;
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
      case "literal":
        return;
    }
  };
  visit(expression);
  return references;
};
