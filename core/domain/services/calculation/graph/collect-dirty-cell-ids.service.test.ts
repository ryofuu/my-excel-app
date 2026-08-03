import { describe, expect, it } from "vitest";

import {
  worksheetId,
  type CellId,
  type DependencyGraph,
} from "../../../index";
import { createCellIdFor } from "../calculation.test-helper";
import { collectDirtyCellIds } from "./collect-dirty-cell-ids.service";

const idFor = createCellIdFor(worksheetId("worksheet-1"));

const graph = (
  directDependentsByCell: ReadonlyMap<CellId, readonly CellId[]>,
): DependencyGraph => ({
  precedentsByCell: new Map(),
  directDependentsByCell,
  rangeDependents: [],
});

describe("DirtyCellの収集", () => {
  it("複数の依存グラフにあるDependentを推移的に収集する", () => {
    const current = graph(new Map([
      [idFor("A1"), [idFor("B1")]],
      [idFor("B1"), [idFor("D1")]],
    ]));
    const previous = graph(new Map([
      [idFor("A1"), [idFor("C1")]],
      [idFor("C1"), [idFor("D1")]],
    ]));

    expect(collectDirtyCellIds([idFor("A1")], [current, previous])).toEqual([
      idFor("A1"),
      idFor("B1"),
      idFor("C1"),
      idFor("D1"),
    ]);
  });
});
