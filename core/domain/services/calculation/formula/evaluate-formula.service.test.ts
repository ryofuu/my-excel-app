import { describe, expect, it } from "vitest";

import {
  compileFormula,
  formulaSource,
  literalValue,
  numberLiteral,
  worksheetId,
  type CellId,
  type CellValue,
} from "../../../index";
import { createCellIdFor } from "../calculation.test-helper";
import { evaluateFormula } from "./evaluate-formula.service";

const idFor = createCellIdFor(worksheetId("worksheet-1"));

const evaluate = (
  source: string,
  values: ReadonlyMap<CellId, CellValue> = new Map(),
): CellValue => evaluateFormula(
  compileFormula(idFor("B1"), formulaSource(source)),
  values,
);

describe("Formulaの評価", () => {
  it("確定済みのPrecedent値を参照してRange関数と演算を評価する", () => {
    const values = new Map<CellId, CellValue>([
      [idFor("A1"), literalValue(numberLiteral(2))],
      [idFor("A2"), literalValue(numberLiteral(3))],
    ]);

    expect(evaluate("=SUM(A1:A2, 4)*2", values)).toEqual({
      kind: "number",
      value: 18,
    });
  });

  it("Parse ErrorをFormula自身のErrorへ変換する", () => {
    expect(evaluate("=1+")).toMatchObject({
      kind: "error",
      code: "parse",
      origin: idFor("B1"),
    });
  });

  it("Rangeを単一Cellの値にはしない", () => {
    expect(evaluate("=A1:A2")).toMatchObject({
      kind: "error",
      code: "type",
      origin: idFor("B1"),
    });
  });
});
