import { describe, expect, it } from "vitest";
import { tokenizeFormula } from "../../index";

describe("Formulaの字句解析", () => {
  it("先頭のイコールと空白をTokenにせずFormulaSource上の位置を保持する", () => {
    const tokens = tokenizeFormula("= A1 + 12");

    expect(tokens.map(({ kind, lexeme, start, end }) => ({ kind, lexeme, start, end }))).toEqual([
      { kind: "reference", lexeme: "A1", start: 2, end: 4 },
      { kind: "operator", lexeme: "+", start: 5, end: 6 },
      { kind: "number", lexeme: "12", start: 7, end: 9 },
      { kind: "eof", lexeme: "", start: 9, end: 9 },
    ]);
  });

  it("二重引用符を重ねたText Literalを1つの引用符として読み取る", () => {
    expect(tokenizeFormula('="say ""hello"""')[0]).toMatchObject({
      kind: "text",
      lexeme: '"say ""hello"""',
      value: 'say "hello"',
    });
  });

  it("Booleanと関数名を大文字小文字を区別せず正規化する", () => {
    expect(tokenizeFormula("=sum(TRUE,false)")).toMatchObject([
      { kind: "identifier", lexeme: "sum", name: "SUM" },
      { kind: "left-paren" },
      { kind: "boolean", lexeme: "TRUE", value: true },
      { kind: "comma" },
      { kind: "boolean", lexeme: "false", value: false },
      { kind: "right-paren" },
      { kind: "eof" },
    ]);
  });

  it("CellReferenceごとに行と列の絶対参照を読み取る", () => {
    const references = tokenizeFormula("=$A1+A$2+$B$3").filter(
      (token) => token.kind === "reference",
    );

    expect(references.map(({ lexeme, reference }) => ({ lexeme, reference }))).toEqual([
      {
        lexeme: "$A1",
        reference: {
          address: { row: 1, column: 1 },
          columnAbsolute: true,
          rowAbsolute: false,
        },
      },
      {
        lexeme: "A$2",
        reference: {
          address: { row: 2, column: 1 },
          columnAbsolute: false,
          rowAbsolute: true,
        },
      },
      {
        lexeme: "$B$3",
        reference: {
          address: { row: 3, column: 2 },
          columnAbsolute: true,
          rowAbsolute: true,
        },
      },
    ]);
  });

  it.each([
    ["1+1", "A formula must start with '='."],
    ["=1e309", "A numeric literal must be finite."],
    ["=XFE1", "ColumnNumber must be an integer from 1 to 16384."],
    ["=$", "A '$' must be followed by a cell reference."],
    ['="閉じていない', "Unterminated text literal."],
    ["=1@2", "Unexpected character '@'."],
  ] as const)("不正なFormulaSource「%s」にinvalid Tokenを残す", (source, message) => {
    const invalid = tokenizeFormula(source).find((token) => token.kind === "invalid");

    expect(invalid).toMatchObject({ kind: "invalid", message });
  });
});
