import { describe, expect, it } from "vitest";
import {
  Cell,
  WorkbookRevision,
  Worksheet,
  cellAddress,
  cellId,
  numberLiteral,
  literalContent,
  revisionNumber,
  worksheetId,
  worksheetName,
  type CellId,
} from "../index";

const ids = {
  firstWorksheet: worksheetId("worksheet-1"),
  secondWorksheet: worksheetId("worksheet-2"),
};

const firstWorksheet = new Worksheet({
  id: ids.firstWorksheet,
  name: worksheetName("集計"),
});

const secondWorksheet = new Worksheet({
  id: ids.secondWorksheet,
  name: worksheetName("詳細"),
});

const cell = (id: CellId): Cell =>
  new Cell({
    id,
    content: literalContent(numberLiteral(42)),
    modifiedRevision: revisionNumber(2),
  });

describe("WorkbookRevision", () => {
  it("Worksheetの順序とCellContentからなる完全な入力状態を保持する", () => {
    const firstCellId = cellId(ids.firstWorksheet, cellAddress(1, 1));
    const revision = new WorkbookRevision({
      number: revisionNumber(2),
      worksheets: [firstWorksheet, secondWorksheet],
      cells: new Map([[firstCellId, cell(firstCellId)]]),
    });

    expect({
      number: revision.number,
      worksheets: revision.worksheets,
      cell: revision.cells.get(firstCellId),
    }).toEqual({
      number: 2,
      worksheets: [firstWorksheet, secondWorksheet],
      cell: cell(firstCellId),
    });
  });

  it("Worksheetを1つも持たない入力状態を拒否する", () => {
    expect(() =>
      new WorkbookRevision({
        number: revisionNumber(2),
        worksheets: [],
        cells: new Map(),
      }),
    ).toThrow("WorkbookRevision must contain at least one Worksheet.");
  });

  it("同じWorksheetIdを持つWorksheetが複数ある入力状態を拒否する", () => {
    expect(() =>
      new WorkbookRevision({
        number: revisionNumber(2),
        worksheets: [
          firstWorksheet,
          new Worksheet({ id: ids.firstWorksheet, name: worksheetName("別名") }),
        ],
        cells: new Map(),
      }),
    ).toThrow(`WorkbookRevision contains duplicate WorksheetId: ${ids.firstWorksheet}`);
  });

  it("同じWorksheetNameを持つWorksheetが複数ある入力状態を拒否する", () => {
    expect(() =>
      new WorkbookRevision({
        number: revisionNumber(2),
        worksheets: [
          firstWorksheet,
          new Worksheet({ id: ids.secondWorksheet, name: firstWorksheet.name }),
        ],
        cells: new Map(),
      }),
    ).toThrow(`WorkbookRevision contains duplicate WorksheetName: ${firstWorksheet.name}`);
  });

  it("Cell MapのkeyとCellIdが一致しない入力状態を拒否する", () => {
    const key = cellId(ids.firstWorksheet, cellAddress(1, 1));
    const differentCellId = cellId(ids.firstWorksheet, cellAddress(2, 1));

    expect(() =>
      new WorkbookRevision({
        number: revisionNumber(2),
        worksheets: [firstWorksheet],
        cells: new Map([[key, cell(differentCellId)]]),
      }),
    ).toThrow(`Cell map key and Cell.id must match: ${key}`);
  });

  it("存在しないWorksheetに属するCellを拒否する", () => {
    const orphanCellId = cellId(ids.secondWorksheet, cellAddress(1, 1));

    expect(() =>
      new WorkbookRevision({
        number: revisionNumber(2),
        worksheets: [firstWorksheet],
        cells: new Map([[orphanCellId, cell(orphanCellId)]]),
      }),
    ).toThrow(`Cell ${orphanCellId} belongs to a Worksheet absent from this revision.`);
  });

  it("Revisionより未来に変更されたCellを拒否する", () => {
    const firstCellId = cellId(ids.firstWorksheet, cellAddress(1, 1));

    expect(() =>
      new WorkbookRevision({
        number: revisionNumber(1),
        worksheets: [firstWorksheet],
        cells: new Map([[firstCellId, cell(firstCellId)]]),
      }),
    ).toThrow(`Cell ${firstCellId} cannot be modified after WorkbookRevision 1.`);
  });

  it("呼び出し元の配列やMapを後から変更しても確定済みの入力状態は変わらない", () => {
    const firstCellId = cellId(ids.firstWorksheet, cellAddress(1, 1));
    const worksheets: Worksheet[] = [firstWorksheet];
    const cells = new Map([[firstCellId, cell(firstCellId)]]);
    const revision = new WorkbookRevision({
      number: revisionNumber(2),
      worksheets,
      cells,
    });

    worksheets.push(secondWorksheet);
    cells.clear();

    expect({
      worksheetCount: revision.worksheets.length,
      cellCount: revision.cells.size,
      worksheetsFrozen: Object.isFrozen(revision.worksheets),
    }).toEqual({ worksheetCount: 1, cellCount: 1, worksheetsFrozen: true });
  });
});
