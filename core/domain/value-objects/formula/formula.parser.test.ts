import { describe, expect, it } from "vitest";
import {
  formulaSource,
  parseFormula,
  tokenizeFormula,
} from "../../index";

const parseSource = (source: string) =>
  parseFormula(tokenizeFormula(formulaSource(source)));

describe("Formulaの構文解析", () => {
  it("乗除算・加減算・文字列結合・比較の順に演算子の優先順位を適用する", () => {
    expect(parseSource('=1+2*3&"!"=7')).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: "=",
        left: {
          kind: "binary",
          operator: "&",
          left: {
            kind: "binary",
            operator: "+",
            left: {
              kind: "literal",
              literal: { kind: "number", value: 1 },
            },
            right: {
              kind: "binary",
              operator: "*",
              left: {
                kind: "literal",
                literal: { kind: "number", value: 2 },
              },
              right: {
                kind: "literal",
                literal: { kind: "number", value: 3 },
              },
            },
          },
          right: {
            kind: "literal",
            literal: { kind: "text", value: "!" },
          },
        },
        right: {
          kind: "literal",
          literal: { kind: "number", value: 7 },
        },
      },
    });
  });

  it("括弧内の式を単項演算子のoperandとして解析する", () => {
    expect(parseSource("=-(1+2)")).toEqual({
      kind: "success",
      expression: {
        kind: "unary",
        operator: "-",
        operand: {
          kind: "binary",
          operator: "+",
          left: {
            kind: "literal",
            literal: { kind: "number", value: 1 },
          },
          right: {
            kind: "literal",
            literal: { kind: "number", value: 2 },
          },
        },
      },
    });
  });

  it("同じ優先順位の加減算を左結合で解析する", () => {
    expect(parseSource("=10-3+2")).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: "+",
        left: {
          kind: "binary",
          operator: "-",
          left: {
            kind: "literal",
            literal: { kind: "number", value: 10 },
          },
          right: {
            kind: "literal",
            literal: { kind: "number", value: 3 },
          },
        },
        right: {
          kind: "literal",
          literal: { kind: "number", value: 2 },
        },
      },
    });
  });

  it("同じ優先順位の乗除算を左結合で解析する", () => {
    expect(parseSource("=20/5*2")).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: "*",
        left: {
          kind: "binary",
          operator: "/",
          left: {
            kind: "literal",
            literal: { kind: "number", value: 20 },
          },
          right: {
            kind: "literal",
            literal: { kind: "number", value: 5 },
          },
        },
        right: {
          kind: "literal",
          literal: { kind: "number", value: 2 },
        },
      },
    });
  });

  it("Text同士のConcatenation演算子を解析する", () => {
    expect(parseSource('="A"&"B"')).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: "&",
        left: {
          kind: "literal",
          literal: { kind: "text", value: "A" },
        },
        right: {
          kind: "literal",
          literal: { kind: "text", value: "B" },
        },
      },
    });
  });

  it("連続する単項演算子を右側から入れ子にして解析する", () => {
    expect(parseSource("=+-1")).toEqual({
      kind: "success",
      expression: {
        kind: "unary",
        operator: "+",
        operand: {
          kind: "unary",
          operator: "-",
          operand: {
            kind: "literal",
            literal: { kind: "number", value: 1 },
          },
        },
      },
    });
  });

  it("Equal比較演算子を解析する", () => {
    expect(parseSource("=1=2")).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: "=",
        left: {
          kind: "literal",
          literal: { kind: "number", value: 1 },
        },
        right: {
          kind: "literal",
          literal: { kind: "number", value: 2 },
        },
      },
    });
  });

  it("NotEqual比較演算子を解析する", () => {
    expect(parseSource("=1<>2")).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: "<>",
        left: {
          kind: "literal",
          literal: { kind: "number", value: 1 },
        },
        right: {
          kind: "literal",
          literal: { kind: "number", value: 2 },
        },
      },
    });
  });

  it("LessThan比較演算子を解析する", () => {
    expect(parseSource("=1<2")).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: "<",
        left: {
          kind: "literal",
          literal: { kind: "number", value: 1 },
        },
        right: {
          kind: "literal",
          literal: { kind: "number", value: 2 },
        },
      },
    });
  });

  it("LessThanOrEqual比較演算子を解析する", () => {
    expect(parseSource("=1<=2")).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: "<=",
        left: {
          kind: "literal",
          literal: { kind: "number", value: 1 },
        },
        right: {
          kind: "literal",
          literal: { kind: "number", value: 2 },
        },
      },
    });
  });

  it("GreaterThan比較演算子を解析する", () => {
    expect(parseSource("=1>2")).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: ">",
        left: {
          kind: "literal",
          literal: { kind: "number", value: 1 },
        },
        right: {
          kind: "literal",
          literal: { kind: "number", value: 2 },
        },
      },
    });
  });

  it("GreaterThanOrEqual比較演算子を解析する", () => {
    expect(parseSource("=1>=2")).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: ">=",
        left: {
          kind: "literal",
          literal: { kind: "number", value: 1 },
        },
        right: {
          kind: "literal",
          literal: { kind: "number", value: 2 },
        },
      },
    });
  });

  it("関数呼び出しの引数としてRangeとCellReferenceを解析する", () => {
    expect(parseSource("=SUM(A1:B2,C3)")).toEqual({
      kind: "success",
      expression: {
        kind: "call",
        name: "SUM",
        arguments: [
          {
            kind: "range",
            range: {
              start: {
                address: { row: 1, column: 1 },
                columnAbsolute: false,
                rowAbsolute: false,
              },
              end: {
                address: { row: 2, column: 2 },
                columnAbsolute: false,
                rowAbsolute: false,
              },
            },
          },
          {
            kind: "reference",
            reference: {
              address: { row: 3, column: 3 },
              columnAbsolute: false,
              rowAbsolute: false,
            },
          },
        ],
      },
    });
  });

  it("CellReferenceの行列ごとの相対参照と絶対参照を保持する", () => {
    expect(parseSource("=$A1+A$2+$B$3")).toEqual({
      kind: "success",
      expression: {
        kind: "binary",
        operator: "+",
        left: {
          kind: "binary",
          operator: "+",
          left: {
            kind: "reference",
            reference: {
              address: { row: 1, column: 1 },
              columnAbsolute: true,
              rowAbsolute: false,
            },
          },
          right: {
            kind: "reference",
            reference: {
              address: { row: 2, column: 1 },
              columnAbsolute: false,
              rowAbsolute: true,
            },
          },
        },
        right: {
          kind: "reference",
          reference: {
            address: { row: 3, column: 2 },
            columnAbsolute: true,
            rowAbsolute: true,
          },
        },
      },
    });
  });

  it("引数のない関数呼び出しを解析する", () => {
    expect(parseSource("=SUM()")).toEqual({
      kind: "success",
      expression: {
        kind: "call",
        name: "SUM",
        arguments: [],
      },
    });
  });

  it("関数引数の中でも比較を含む完全な式を解析する", () => {
    expect(parseSource("=SUM(1=1,2)")).toEqual({
      kind: "success",
      expression: {
        kind: "call",
        name: "SUM",
        arguments: [
          {
            kind: "binary",
            operator: "=",
            left: {
              kind: "literal",
              literal: { kind: "number", value: 1 },
            },
            right: {
              kind: "literal",
              literal: { kind: "number", value: 1 },
            },
          },
          {
            kind: "literal",
            literal: { kind: "number", value: 2 },
          },
        ],
      },
    });
  });

  it("Number Literalを解析する", () => {
    expect(parseSource("=42")).toEqual({
      kind: "success",
      expression: {
        kind: "literal",
        literal: { kind: "number", value: 42 },
      },
    });
  });

  it("Text Literalを解析する", () => {
    expect(parseSource('="集計"')).toEqual({
      kind: "success",
      expression: {
        kind: "literal",
        literal: { kind: "text", value: "集計" },
      },
    });
  });

  it("Boolean Literalを解析する", () => {
    expect(parseSource("=TRUE")).toEqual({
      kind: "success",
      expression: {
        kind: "literal",
        literal: { kind: "boolean", value: true },
      },
    });
  });

  it("空のFormulaに式が必要な位置を返す", () => {
    expect(parseSource("=")).toEqual({
      kind: "error",
      error: {
        message: "Expected an expression.",
        start: 1,
        end: 1,
      },
    });
  });

  it("Range終端のCellReferenceが必要な位置を返す", () => {
    expect(parseSource("=A1:")).toEqual({
      kind: "error",
      error: {
        message: "A range must end with a cell reference.",
        start: 4,
        end: 4,
      },
    });
  });

  it("末尾Commaの後に関数引数が必要な位置を返す", () => {
    expect(parseSource("=SUM(1,)")).toEqual({
      kind: "error",
      error: {
        message: "A function argument is required after ','.",
        start: 7,
        end: 8,
      },
    });
  });

  it("関数呼び出しを閉じるRightParenが必要な位置を返す", () => {
    expect(parseSource("=SUM(1")).toEqual({
      kind: "error",
      error: {
        message: "Expected ')' after function SUM.",
        start: 6,
        end: 6,
      },
    });
  });

  it("式の後に残った未消費Tokenの位置を返す", () => {
    expect(parseSource("=1 2")).toEqual({
      kind: "error",
      error: {
        message: "Unexpected token '2'.",
        start: 3,
        end: 4,
      },
    });
  });

  it("関数名の後にLeftParenが必要な位置を返す", () => {
    expect(parseSource("=SUM")).toEqual({
      kind: "error",
      error: {
        message: "Expected '(' after function SUM.",
        start: 4,
        end: 4,
      },
    });
  });

  it("括弧式を閉じるRightParenが必要な位置を返す", () => {
    expect(parseSource("=(1+2")).toEqual({
      kind: "error",
      error: {
        message: "Expected ')'.",
        start: 5,
        end: 5,
      },
    });
  });

  it("BinaryOperatorの右辺に式が必要な位置を返す", () => {
    expect(parseSource("=1+")).toEqual({
      kind: "error",
      error: {
        message: "Expected an expression.",
        start: 3,
        end: 3,
      },
    });
  });

  it("Invalid Tokenの理由と位置をそのまま返す", () => {
    expect(parseSource("=@")).toEqual({
      kind: "error",
      error: {
        message: "Unexpected character '@'.",
        start: 1,
        end: 2,
      },
    });
  });
});
