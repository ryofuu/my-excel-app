import { describe, expect, it } from "vitest";
import {
  Worksheet,
  cellAddress,
  cellId,
  numberLiteral,
  literalContent,
  revisionNumber,
  workbookChangeSet,
  workbookId,
  worksheetId,
  worksheetName,
  type CellChange,
} from "../index";

const ids = {
  workbook: workbookId("workbook-1"),
  worksheet: worksheetId("worksheet-1"),
};

const worksheet = new Worksheet({ id: ids.worksheet, name: worksheetName("集計") });
const firstCellId = cellId(ids.worksheet, cellAddress(1, 1));
const secondCellId = cellId(ids.worksheet, cellAddress(2, 1));

const change = (value: number): CellChange => ({
  cellId: firstCellId,
  content: literalContent(numberLiteral(value)),
});

describe("WorkbookChangeSet", () => {
  it("CellContentの変更を1回の利用者操作として保持する", () => {
    expect(
      workbookChangeSet({
        workbookId: ids.workbook,
        baseRevision: revisionNumber(2),
        cellChanges: [change(42)],
      }),
    ).toEqual({
      workbookId: ids.workbook,
      baseRevision: 2,
      cellChanges: [change(42)],
    });
  });

  it("CellContentを削除する変更をnullとして保持する", () => {
    const result = workbookChangeSet({
      workbookId: ids.workbook,
      baseRevision: revisionNumber(2),
      cellChanges: [{ cellId: firstCellId, content: null }],
    });

    expect(result.cellChanges).toEqual([{ cellId: firstCellId, content: null }]);
  });

  it("CellとWorksheetの変更を1つの原子的な操作として保持できる", () => {
    const result = workbookChangeSet({
      workbookId: ids.workbook,
      baseRevision: revisionNumber(2),
      cellChanges: [change(42)],
      nextWorksheets: [worksheet],
    });

    expect({ cellChanges: result.cellChanges, nextWorksheets: result.nextWorksheets }).toEqual({
      cellChanges: [change(42)],
      nextWorksheets: [worksheet],
    });
  });

  it("CellもWorksheetも変更しない操作を拒否する", () => {
    expect(() =>
      workbookChangeSet({
        workbookId: ids.workbook,
        baseRevision: revisionNumber(2),
        cellChanges: [],
      }),
    ).toThrow("WorkbookChangeSet must change Cells or Worksheets.");
  });

  it("Worksheetが1つも残らない構造変更を拒否する", () => {
    expect(() =>
      workbookChangeSet({
        workbookId: ids.workbook,
        baseRevision: revisionNumber(2),
        cellChanges: [],
        nextWorksheets: [],
      }),
    ).toThrow("WorkbookChangeSet must retain at least one Worksheet.");
  });

  it("同じCellを1回の操作で複数回変更することを拒否する", () => {
    expect(() =>
      workbookChangeSet({
        workbookId: ids.workbook,
        baseRevision: revisionNumber(2),
        cellChanges: [change(42), change(43)],
      }),
    ).toThrow(`WorkbookChangeSet cannot change a Cell more than once: ${firstCellId}`);
  });

  it("異なるCellへの変更を同じ操作に含められる", () => {
    const result = workbookChangeSet({
      workbookId: ids.workbook,
      baseRevision: revisionNumber(2),
      cellChanges: [
        change(42),
        { cellId: secondCellId, content: literalContent(numberLiteral(43)) },
      ],
    });

    expect(result.cellChanges.map(({ cellId: changedCellId }) => changedCellId)).toEqual([
      firstCellId,
      secondCellId,
    ]);
  });

  it("呼び出し元の配列を後から変更しても確定済みの操作は変わらない", () => {
    const cellChanges: CellChange[] = [change(42)];
    const nextWorksheets: Worksheet[] = [worksheet];
    const result = workbookChangeSet({
      workbookId: ids.workbook,
      baseRevision: revisionNumber(2),
      cellChanges,
      nextWorksheets,
    });

    cellChanges.push({ cellId: secondCellId, content: null });
    nextWorksheets.push(
      new Worksheet({ id: worksheetId("worksheet-2"), name: worksheetName("詳細") }),
    );

    expect({
      cellChangeCount: result.cellChanges.length,
      worksheetCount: result.nextWorksheets?.length,
      cellChangesFrozen: Object.isFrozen(result.cellChanges),
      worksheetsFrozen: Object.isFrozen(result.nextWorksheets),
    }).toEqual({
      cellChangeCount: 1,
      worksheetCount: 1,
      cellChangesFrozen: true,
      worksheetsFrozen: true,
    });
  });
});
