import { describe, expect, it } from "vitest";

import {
  cellId,
  compileFormula,
  formulaSource,
  parseA1Address,
  worksheetId,
  type CellId,
  type FormulaAnalysis,
} from "../../index";
import { createFormulaAdjacency } from "./create-formula-adjacency.service";

const owner = worksheetId("worksheet-1");
const idFor = (address: string): CellId => cellId(owner, parseA1Address(address));

const formula = (address: string, source: string): FormulaAnalysis =>
  compileFormula(idFor(address), formulaSource(source));

describe("FormulaAdjacencyの作成", () => {
  it("Cell参照とRange参照から対象Formula間の隣接関係を作る", () => {
    const formulas = new Map<CellId, FormulaAnalysis>([
      [idFor("A1"), formula("A1", "=B1")],
      [idFor("B1"), formula("B1", "=SUM(C1:D1)")],
      [idFor("C1"), formula("C1", "=1")],
      [idFor("D1"), formula("D1", "=2")],
    ]);

    expect(createFormulaAdjacency(new Set(formulas.keys()), formulas)).toEqual(new Map([
      [idFor("A1"), [idFor("B1")]],
      [idFor("B1"), [idFor("C1"), idFor("D1")]],
      [idFor("C1"), []],
      [idFor("D1"), []],
    ]));
  });

  it("自己参照を循環検出のために残す", () => {
    const formulas = new Map<CellId, FormulaAnalysis>([
      [idFor("A1"), formula("A1", "=A1")],
    ]);

    expect(createFormulaAdjacency(new Set(formulas.keys()), formulas)).toEqual(new Map([
      [idFor("A1"), [idFor("A1")]],
    ]));
  });
});
