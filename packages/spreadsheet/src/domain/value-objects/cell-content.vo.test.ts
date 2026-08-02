import { describe, expect, it } from "vitest";
import { cellContentEquals, formulaSource, numberLiteral, parseCellInput } from "../index";

describe("CellContent", () => {
  describe("入力文字列の分類", () => {
    it("空文字はCellContentが設定されていない状態になる", () => {
      expect(parseCellInput("")).toBeNull();
    });

    it("先頭がイコールなら構文が壊れていてもFormulaSourceをそのまま保持する", () => {
      expect(parseCellInput("=1+")).toEqual({ kind: "formula", source: "=1+" });
    });

    it("先頭のアポストロフィを外して残りをText Literalとして保持する", () => {
      expect(parseCellInput("'=A1")).toEqual({
        kind: "literal",
        literal: { kind: "text", value: "=A1" },
      });
    });

    it.each([
      ["TRUE", true],
      ["true", true],
      ["False", false],
    ] as const)("%sは大文字小文字を区別せずBoolean Literalになる", (input, value) => {
      expect(parseCellInput(input)).toEqual({
        kind: "literal",
        literal: { kind: "boolean", value },
      });
    });

    it.each([
      ["42", 42],
      ["+12", 12],
      ["-0.5", -0.5],
      [".75", 0.75],
      ["2.", 2],
      ["1e3", 1_000],
    ] as const)("%sはNumber Literalになる", (input, value) => {
      expect(parseCellInput(input)).toEqual({
        kind: "literal",
        literal: { kind: "number", value },
      });
    });

    it.each([" 42", "42 ", "1,000", "0x10", "1e309", "hello"])(
      "%sは数値へ補正せずText Literalとして保持する",
      (input) => {
        expect(parseCellInput(input)).toEqual({
          kind: "literal",
          literal: { kind: "text", value: input },
        });
      },
    );
  });

  describe("FormulaSourceの不変条件", () => {
    it("イコールで始まらない文字列を拒否する", () => {
      expect(() => formulaSource("A1+1")).toThrow("FormulaSource must start with '='.");
    });

    it("イコールで始まれば数式としての構文検証は行わない", () => {
      expect(formulaSource("=1+")).toBe("=1+");
    });
  });

  describe("Number Literalの不変条件", () => {
    it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      "%sは有限の数値ではないため拒否する",
      (value) => {
        expect(() => numberLiteral(value)).toThrow("A numeric literal must be finite.");
      },
    );
  });

  describe("CellContentの等価性", () => {
    it("別々に生成したCellContentでもLiteralの種類と値が同じなら等しい", () => {
      expect(cellContentEquals(parseCellInput("42"), parseCellInput("42"))).toBe(true);
    });

    it("FormulaSourceの文字列が異なれば計算結果が同じでも異なる", () => {
      expect(cellContentEquals(parseCellInput("=1+1"), parseCellInput("=2"))).toBe(false);
    });

    it("表示が同じでもNumber LiteralとText Literalは異なる", () => {
      expect(cellContentEquals(parseCellInput("42"), parseCellInput("'42"))).toBe(false);
    });

    it("CellContentが設定されていないCell同士は等しい", () => {
      expect(cellContentEquals(null, null)).toBe(true);
    });

    it("CellContentの有無が異なれば等しくない", () => {
      expect(cellContentEquals(parseCellInput("42"), null)).toBe(false);
    });
  });
});
