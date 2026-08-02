import { describe, expect, it } from "vitest";
import {
  formulaSource,
  parseFormula,
  tokenizeFormula,
  type Expression,
} from "../../index";

const parseSource = (source: string) =>
  parseFormula(tokenizeFormula(formulaSource(source)));

const expressionOf = (source: string): Expression => {
  const result = parseSource(source);
  if (result.kind === "error") {
    throw new Error(`Formulaの解析に失敗しました: ${result.error.message}`);
  }
  return result.expression;
};

describe("Formulaの構文解析", () => {
  it("乗除算・加減算・文字列結合・比較の順に演算子の優先順位を適用する", () => {
    expect(expressionOf('=1+2*3&"!"=7')).toMatchObject({
      kind: "binary",
      operator: "=",
      left: {
        kind: "binary",
        operator: "&",
        left: {
          kind: "binary",
          operator: "+",
          right: { kind: "binary", operator: "*" },
        },
      },
    });
  });

  it("括弧内の式を単項演算子のoperandとして解析する", () => {
    expect(expressionOf("=-(1+2)")).toMatchObject({
      kind: "unary",
      operator: "-",
      operand: { kind: "binary", operator: "+" },
    });
  });

  it("関数呼び出しの引数としてRangeとCellReferenceを解析する", () => {
    const expression = expressionOf("=SUM(A1:B2,C3)");

    expect(expression).toMatchObject({
      kind: "call",
      name: "SUM",
      arguments: [{ kind: "range" }, { kind: "reference" }],
    });
  });

  it.each([
    ["=42", { kind: "number", value: 42 }],
    ['="集計"', { kind: "text", value: "集計" }],
    ["=TRUE", { kind: "boolean", value: true }],
  ] as const)("Literalを含むFormulaSource「%s」を解析する", (source, literal) => {
    expect(expressionOf(source)).toEqual({ kind: "literal", literal });
  });

  it.each([
    ["=", "Expected an expression."],
    ["=A1:", "A range must end with a cell reference."],
    ["=SUM(1,)", "A function argument is required after ','."],
    ["=SUM(1", "Expected ')' after function SUM."],
    ["=1 2", "Unexpected token '2'."],
  ] as const)("不正なFormulaSource「%s」の解析位置と理由を返す", (source, message) => {
    const result = parseSource(source);

    expect(result).toMatchObject({
      kind: "error",
      error: { message, start: expect.any(Number), end: expect.any(Number) },
    });
  });
});
