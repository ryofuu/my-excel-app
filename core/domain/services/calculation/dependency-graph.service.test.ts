import { describe, expect, it } from "vitest";

import {
  cellId,
  dependentsOf,
  parseA1Address,
  worksheetId,
  type CellId,
  type DependencyGraph,
  type WorksheetId,
} from "../../index";

const firstWorksheetId = worksheetId("worksheet-1");
const secondWorksheetId = worksheetId("worksheet-2");

const idFor = (
  address: string,
  owner: WorksheetId = firstWorksheetId,
): CellId => cellId(owner, parseA1Address(address));

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
          dependent: idFor("A2", secondWorksheetId),
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
