import { describe, expect, it } from "vitest";
import {
  BLANK,
  booleanLiteral,
  cellAddress,
  cellId,
  cellValueEquals,
  errorValue,
  formatCellValue,
  isErrorValue,
  literalValue,
  numberLiteral,
  textLiteral,
  worksheetId,
  type CellErrorCode,
} from "../index";

const origin = cellId(worksheetId("worksheet-1"), cellAddress(1, 1));

describe("CellValue", () => {
  describe("表示文字列への変換", () => {
    it.each([
      ["", BLANK],
      ["-12.5", literalValue(numberLiteral(-12.5))],
      ["集計", literalValue(textLiteral("集計"))],
      ["TRUE", literalValue(booleanLiteral(true))],
      ["FALSE", literalValue(booleanLiteral(false))],
    ] as const)("CellValueを「%s」として表示する", (expected, value) => {
      expect(formatCellValue(value)).toBe(expected);
    });

    it.each([
      ["division-by-zero", "#DIV/0!"],
      ["circular-reference", "#CIRC!"],
      ["parse", "#PARSE!"],
      ["invalid-reference", "#REF!"],
      ["unknown-function", "#NAME?"],
      ["type", "#VALUE!"],
    ] as const)("%s Errorを%sとして表示する", (code, expected) => {
      expect(formatCellValue(errorValue(code, origin, "詳細"))).toBe(expected);
    });
  });

  describe("Error", () => {
    it("原因コード・発生元のCellId・詳細を保持する", () => {
      expect(errorValue("parse", origin, "式を解析できません")).toEqual({
        kind: "error",
        code: "parse",
        origin,
        message: "式を解析できません",
      });
    });

    it("Errorを判定できる", () => {
      expect(isErrorValue(errorValue("parse", origin, "式を解析できません"))).toBe(true);
    });

    it.each([
      ["Blank", BLANK],
      ["Number Literal", numberLiteral(1)],
    ] as const)("%sをErrorとみなさない", (_label, value) => {
      expect(isErrorValue(value)).toBe(false);
    });
  });

  describe("CellValueの等価性", () => {
    it("Blank同士を等しいとみなす", () => {
      expect(cellValueEquals(BLANK, { kind: "blank" })).toBe(true);
    });

    it("Literalの種類と値が同じなら等しい", () => {
      expect(cellValueEquals(numberLiteral(42), numberLiteral(42))).toBe(true);
    });

    it("Literalの種類または値が異なれば等しくない", () => {
      expect([
        cellValueEquals(numberLiteral(42), numberLiteral(43)),
        cellValueEquals(numberLiteral(42), textLiteral("42")),
      ]).toEqual([false, false]);
    });

    it.each([
      ["原因コード・発生元・詳細がすべて同じなら等しい", "parse", origin, "同じ詳細", true],
      ["原因コードが異なれば等しくない", "type", origin, "同じ詳細", false],
      [
        "発生元が異なれば等しくない",
        "parse",
        cellId(worksheetId("worksheet-1"), cellAddress(2, 1)),
        "同じ詳細",
        false,
      ],
      ["詳細が異なれば等しくない", "parse", origin, "異なる詳細", false],
    ] as const)(
      "%s",
      (_description, code, comparedOrigin, message, expected) => {
        const left = errorValue("parse", origin, "同じ詳細");
        const right = errorValue(code as CellErrorCode, comparedOrigin, message);

        expect(cellValueEquals(left, right)).toBe(expected);
      },
    );
  });
});
