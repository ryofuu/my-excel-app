import { describe, expect, it } from "vitest";
import {
  cellId,
  compileFormula,
  formulaSource,
  parseA1Address,
  worksheetId,
} from "../../../index";

const formulaId = cellId(
  worksheetId("worksheet-1"),
  parseA1Address("A10"),
);

describe("Formula Compilerの統合", () => {
  it("FormulaSourceからToken・AST・依存関係をまとめて導出する", () => {
    const analysis = compileFormula(
      formulaId,
      formulaSource('=SUM(A1:$B2, 3*-(C3-1))&"!"'),
    );

    expect(
      analysis.tokens
        .filter((token) => token.kind === "reference")
        .map((token) => token.lexeme),
    ).toEqual(["A1", "$B2", "C3"]);
    expect(analysis.parse).toMatchObject({
      kind: "success",
      ast: { kind: "binary" },
    });
    expect(analysis.dependencies).toHaveLength(2);
  });

  it("壊れたFormulaSourceを保持し、依存関係のないParse Errorにする", () => {
    const source = formulaSource("=1+");
    const analysis = compileFormula(formulaId, source);

    expect(analysis.source).toBe(source);
    expect(analysis.parse).toMatchObject({
      kind: "error",
      error: { message: "Expected an expression." },
    });
    expect(analysis.dependencies).toEqual([]);
  });
});
