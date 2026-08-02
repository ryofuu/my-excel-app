import { booleanLiteral, numberLiteral, textLiteral } from "../cell-content.vo";
import type {
  BinaryOperator,
  Expression,
  FormulaAST,
  UnaryOperator,
} from "./formula.ast";
import type { FormulaToken } from "./formula.tokenizer";

export type FormulaParseError = Readonly<{
  message: string;
  start: number;
  end: number;
}>;

export type FormulaParseResult =
  | Readonly<{
      kind: "success";
      ast: FormulaAST;
    }>
  | Readonly<{
      kind: "error";
      error: FormulaParseError;
    }>;

type ParseState = {
  index: number;
  readonly tokens: readonly FormulaToken[];
};

type ParseStep = Readonly<{ kind: "success"; expression: Expression }> | Readonly<{ kind: "error"; error: FormulaParseError }>;

const current = (state: ParseState): FormulaToken => {
  const token = state.tokens[state.index];
  if (token !== undefined) {
    return token;
  }
  const end = state.tokens[state.tokens.length - 1]?.end ?? 0;
  return {
    kind: "eof",
    lexeme: "",
    start: end,
    end,
  };
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

// Literal、CellReference、Range、関数呼び出し、括弧式を AST の最小単位へ変換する。
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
          // 関数引数にも比較を含む完全な式を許可するため、最上位の規則から再帰する。
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

// 各関数は「自分より結合が強い規則」を先に解析する。
// Primary → Unary → 乗除 → 加減 → 文字列結合 → 比較、の順で演算子優先順位を表現する。
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

/** Tokenizer が生成した FormulaToken 列を、FormulaAST または位置付き Error へ変換する。 */
export const parseFormula = (
  tokens: readonly FormulaToken[],
): FormulaParseResult => {
  const state: ParseState = { index: 0, tokens };
  // 比較は最も結合が弱いので、式全体の入口になる。
  const expression = parseComparison(state);
  if (expression.kind === "error") {
    return { kind: "error", error: expression.error };
  }

  const tail = current(state);
  // AST が作れても未消費 Token があれば、Formula 全体としては不正とする。
  if (tail.kind !== "eof") {
    return {
      kind: "error",
      error: { message: `Unexpected token '${tail.lexeme}'.`, start: tail.start, end: tail.end },
    };
  }

  return { kind: "success", ast: expression.expression };
};
