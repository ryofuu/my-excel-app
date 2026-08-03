import { describe, expect, it } from "vitest";

import {
  worksheetId,
} from "../../../index";
import type { FormulaAdjacency } from "../../../derived/calculation/dependency-graph.derived";
import { createCellIdFor } from "../calculation.test-helper";
import { detectCircularReferences } from "./detect-circular-references.service";

const idFor = createCellIdFor(worksheetId("worksheet-1"));

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
