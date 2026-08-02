import { describe, expect, it } from "vitest";

import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellAddress,
  cellId,
  createWorkbookRevision,
  parseCellInput,
  revisionNumber,
  workbookChangeSet,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
} from "../../index";

const firstWorksheet = new Worksheet({
  id: worksheetId("worksheet-1"),
  name: worksheetName("Sheet1"),
});
const secondWorksheet = new Worksheet({
  id: worksheetId("worksheet-2"),
  name: worksheetName("Sheet2"),
});
const a1 = cellId(firstWorksheet.id, cellAddress(1, 1));

const workbookAt = (number: number): Workbook =>
  new Workbook({
    id: workbookId("workbook-1"),
    name: workbookName("Budget"),
    revision: new WorkbookRevision({
      number: revisionNumber(number),
      worksheets: [firstWorksheet, secondWorksheet],
      cells: new Map([
        [
          a1,
          new Cell({
            id: a1,
            content: parseCellInput("10"),
            modifiedRevision: revisionNumber(number),
          }),
        ],
      ]),
    }),
  });

describe("createWorkbookRevision", () => {
  it("検証済みChangeSetから次の完全なWorkbook集約を作る", () => {
    const current = workbookAt(2);
    const b1 = cellId(firstWorksheet.id, cellAddress(1, 2));

    const result = createWorkbookRevision(
      current,
      workbookChangeSet({
        workbookId: current.id,
        baseRevision: current.revision.number,
        cellChanges: [{ cellId: b1, content: parseCellInput("20") }],
      }),
    );

    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.workbook.revision.number).toBe(3);
    expect(result.workbook.revision.cells.get(a1)?.content).toEqual(
      parseCellInput("10"),
    );
    expect(result.workbook.revision.cells.get(b1)).toMatchObject({
      content: { kind: "literal", literal: { kind: "number", value: 20 } },
      modifiedRevision: 3,
    });
  });

  it("内容を削除したCellをcontent nullのEntityとして残す", () => {
    const current = workbookAt(0);
    const result = createWorkbookRevision(
      current,
      workbookChangeSet({
        workbookId: current.id,
        baseRevision: current.revision.number,
        cellChanges: [{ cellId: a1, content: null }],
      }),
    );

    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.workbook.revision.cells.get(a1)).toMatchObject({
      content: null,
      modifiedRevision: 1,
    });
  });

  it("基準版より後に変更されたCellをEditConflictにする", () => {
    const current = workbookAt(2);
    const result = createWorkbookRevision(
      current,
      workbookChangeSet({
        workbookId: current.id,
        baseRevision: revisionNumber(1),
        cellChanges: [{ cellId: a1, content: parseCellInput("20") }],
      }),
    );

    expect(result).toEqual({
      kind: "edit-conflict",
      workbookId: current.id,
      baseRevision: 1,
      conflictingCellIds: [a1],
    });
  });

  it("古いWorksheet Snapshotを適用しない", () => {
    const current = workbookAt(2);
    const result = createWorkbookRevision(
      current,
      workbookChangeSet({
        workbookId: current.id,
        baseRevision: revisionNumber(1),
        cellChanges: [],
        nextWorksheets: [firstWorksheet],
      }),
    );

    expect(result).toEqual({
      kind: "revision-not-found",
      requestedRevision: 1,
    });
  });

  it("Worksheetを削除するRevisionから所属Cellを除く", () => {
    const current = workbookAt(0);
    const secondCellId = cellId(secondWorksheet.id, cellAddress(1, 1));
    const withSecondCell = new Workbook({
      id: current.id,
      name: current.name,
      revision: new WorkbookRevision({
        number: current.revision.number,
        worksheets: current.revision.worksheets,
        cells: new Map([
          ...current.revision.cells,
          [
            secondCellId,
            new Cell({
              id: secondCellId,
              content: parseCellInput("30"),
              modifiedRevision: revisionNumber(0),
            }),
          ],
        ]),
      }),
    });

    const result = createWorkbookRevision(
      withSecondCell,
      workbookChangeSet({
        workbookId: current.id,
        baseRevision: current.revision.number,
        cellChanges: [],
        nextWorksheets: [firstWorksheet],
      }),
    );

    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    expect(result.workbook.revision.cells.has(a1)).toBe(true);
    expect(result.workbook.revision.cells.has(secondCellId)).toBe(false);
  });
});
