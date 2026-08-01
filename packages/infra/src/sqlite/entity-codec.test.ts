import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellAddress,
  cellId,
  formulaContent,
  revisionNumber,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
} from "@gridline/domain";
import { describe, expect, it } from "vitest";

import {
  fromWorkbookDto,
  fromWorkbookRevisionDto,
  toWorkbookChangeSetDto,
  toWorkbookDto,
  toWorkbookRevisionDto,
} from "./entity-codec";

describe("SQLite Entity codec", () => {
  it("keeps entity state on the plain Worker DTO boundary", () => {
    const workbookIdValue = workbookId("book-1");
    const worksheetIdValue = worksheetId("sheet-1");
    const formulaCell = cellId(worksheetIdValue, cellAddress(2, 3));
    const workbook = new Workbook({
      id: workbookIdValue,
      name: workbookName("Formula lab"),
      currentRevision: revisionNumber(3),
    });
    const revision = new WorkbookRevision({
      workbookId: workbookIdValue,
      number: revisionNumber(3),
      worksheets: [
        new Worksheet({
          id: worksheetIdValue,
          name: worksheetName("Sheet1"),
        }),
      ],
      cells: new Map([
        [
          formulaCell,
          new Cell({
            id: formulaCell,
            content: formulaContent("=A1+B1"),
            modifiedRevision: revisionNumber(3),
          }),
        ],
      ]),
    });

    const workbookDto = toWorkbookDto(workbook);
    const revisionDto = toWorkbookRevisionDto(revision);
    const restoredWorkbook = fromWorkbookDto(workbookDto);
    const restoredRevision = fromWorkbookRevisionDto(revisionDto);

    expect(workbookDto).toEqual({
      id: "book-1",
      name: "Formula lab",
      currentRevision: 3,
    });
    expect(revisionDto.cells).toEqual([
      {
        cellId: "sheet-1!C2",
        worksheetId: "sheet-1",
        row: 2,
        column: 3,
        content: { kind: "formula", source: "=A1+B1" },
        modifiedRevision: 3,
      },
    ]);
    expect(restoredWorkbook).toMatchObject({ id: workbookIdValue, currentRevision: 3 });
    expect(restoredRevision.cells.get(formulaCell)).toMatchObject({
      content: { kind: "formula", source: "=A1+B1" },
    });
  });

  it("creates a tombstone-capable ChangeSet DTO without giving the caller a target revision", () => {
    const workbookIdValue = workbookId("book-1");
    const worksheetIdValue = worksheetId("sheet-1");
    const target = cellId(worksheetIdValue, cellAddress(7, 5));
    const dto = toWorkbookChangeSetDto({
      workbookId: workbookIdValue,
      baseRevision: revisionNumber(4),
      cellChanges: [{ cellId: target, content: null }],
    });

    expect(dto).toEqual({
      workbookId: "book-1",
      baseRevision: 4,
      cellChanges: [
        {
          cellId: "sheet-1!E7",
          worksheetId: "sheet-1",
          row: 7,
          column: 5,
          content: null,
          modifiedRevision: -1,
        },
      ],
    });
  });
});
