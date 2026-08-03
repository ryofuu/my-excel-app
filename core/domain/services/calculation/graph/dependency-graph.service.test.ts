import { describe, expect, it } from "vitest";

import {
  dependentsOf,
  parseA1Address,
  worksheetId,
  type DependencyGraph,
} from "../../../index";
import { createCellIdFor } from "../calculation.test-helper";

const firstWorksheetId = worksheetId("worksheet-1");
const secondWorksheetId = worksheetId("worksheet-2");

const idFor = createCellIdFor(firstWorksheetId);
const secondIdFor = createCellIdFor(secondWorksheetId);

describe("Dependentの検索", () => {
  it("直接参照と同じWorksheetのRange参照を重複なく安定順で返す", () => {
    const graph: DependencyGraph = {
      precedentsByCell: new Map(),
      directDependentsByCell: new Map([
        [idFor("A1"), [idFor("D1"), idFor("B1")]],
      ]),
      rangeDependents: [
        {
          range: {
            kind: "range",
            worksheetId: firstWorksheetId,
            start: parseA1Address("A1"),
            end: parseA1Address("B2"),
          },
          dependent: idFor("C1"),
        },
        {
          range: {
            kind: "range",
            worksheetId: firstWorksheetId,
            start: parseA1Address("A1"),
            end: parseA1Address("A1"),
          },
          dependent: idFor("B1"),
        },
        {
          range: {
            kind: "range",
            worksheetId: secondWorksheetId,
            start: parseA1Address("A1"),
            end: parseA1Address("A1"),
          },
          dependent: secondIdFor("A2"),
        },
      ],
    };

    expect(dependentsOf(graph, idFor("A1"))).toEqual([
      idFor("B1"),
      idFor("C1"),
      idFor("D1"),
    ]);
  });
});
