import { describe, expect, it } from "vitest";

import {
  cellId,
  parseA1Address,
  worksheetId,
  type CellId,
} from "../../index";
import type { FormulaAdjacency } from "../../derived/calculation/dependency-graph.derived";
import { topologicallySortFormulas } from "./topologically-sort-formulas.service";

const owner = worksheetId("worksheet-1");
const idFor = (address: string): CellId => cellId(owner, parseA1Address(address));

describe("Formulaのトポロジカルソート", () => {
  it("PrecedentからDependentの順へ安定して並べる", () => {
    const adjacency: FormulaAdjacency = new Map([
      [idFor("D1"), [idFor("C1"), idFor("B1")]],
      [idFor("C1"), [idFor("A1")]],
      [idFor("B1"), [idFor("A1")]],
      [idFor("A1"), []],
    ]);

    expect(topologicallySortFormulas(adjacency, new Set())).toEqual([
      idFor("A1"),
      idFor("B1"),
      idFor("C1"),
      idFor("D1"),
    ]);
  });

  it("循環Formulaを除外してDependentを残す", () => {
    const adjacency: FormulaAdjacency = new Map([
      [idFor("A1"), [idFor("B1")]],
      [idFor("B1"), [idFor("A1")]],
      [idFor("C1"), [idFor("A1")]],
    ]);

    expect(
      topologicallySortFormulas(
        adjacency,
        new Set([idFor("A1"), idFor("B1")]),
      ),
    ).toEqual([idFor("C1")]);
  });
});
