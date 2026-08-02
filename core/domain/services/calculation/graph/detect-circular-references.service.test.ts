import { describe, expect, it } from "vitest";

import {
  cellId,
  parseA1Address,
  worksheetId,
  type CellId,
} from "../../../index";
import type { FormulaAdjacency } from "../../../derived/calculation/dependency-graph.derived";
import { detectCircularReferences } from "./detect-circular-references.service";

const owner = worksheetId("worksheet-1");
const idFor = (address: string): CellId => cellId(owner, parseA1Address(address));

describe("CircularReferenceの検出", () => {
  it("複数Formulaの循環と自己参照を強連結成分として返す", () => {
    const adjacency: FormulaAdjacency = new Map([
      [idFor("D1"), []],
      [idFor("C1"), [idFor("C1")]],
      [idFor("B1"), [idFor("A1")]],
      [idFor("A1"), [idFor("B1")]],
    ]);

    expect(detectCircularReferences(adjacency)).toEqual([
      [idFor("A1"), idFor("B1")],
      [idFor("C1")],
    ]);
  });
});
