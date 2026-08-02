import {
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellAddress,
  cellId,
  literalContent,
  numberLiteral,
  revisionNumber,
  workbookChangeSet,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
} from "@gridline/spreadsheet/domain";
import { describe, expect, it } from "vitest";

import { createInMemoryRepositories } from "./in-memory-repositories.adapter";

const seed = () => {
  const id = workbookId("workbook-1");
  const worksheet = new Worksheet({
    id: worksheetId("worksheet-1"),
    name: worksheetName("Sheet1"),
  });
  const workbook = new Workbook({
    id,
    name: workbookName("Budget"),
    currentRevision: revisionNumber(0),
  });
  const revision = new WorkbookRevision({
    workbookId: id,
    number: revisionNumber(0),
    worksheets: [worksheet],
    cells: new Map(),
  });
  return { workbook, revision, worksheet };
};

const numberChange = (
  workbookIdValue: ReturnType<typeof workbookId>,
  worksheetIdValue: ReturnType<typeof worksheetId>,
  baseRevision: number,
  row: number,
  column: number,
  value: number,
) =>
  workbookChangeSet({
    workbookId: workbookIdValue,
    baseRevision: revisionNumber(baseRevision),
    cellChanges: [
      {
        cellId: cellId(worksheetIdValue, cellAddress(row, column)),
        content: literalContent(numberLiteral(value)),
      },
    ],
  });

describe("インメモリWorkbook Repository", () => {
  it("変更後の完全なWorksheet SnapshotからWorksheetを作成する", async () => {
    const repositories = createInMemoryRepositories();
    const initial = seed();
    await repositories.workbooks.create(initial);
    const secondWorksheet = new Worksheet({
      id: worksheetId("worksheet-2"),
      name: worksheetName("Sheet2"),
    });

    const created = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: initial.workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [],
        nextWorksheets: [initial.worksheet, secondWorksheet],
      }),
    );

    expect(created.kind).toBe("created");
    if (created.kind === "created") {
      expect(created.state.revision.number).toBe(revisionNumber(1));
      expect(created.state.revision.worksheets).toEqual([
        initial.worksheet,
        secondWorksheet,
      ]);
    }
  });

  it("1つのRevisionでWorksheetとそのCellを削除する", async () => {
    const repositories = createInMemoryRepositories();
    const initial = seed();
    await repositories.workbooks.create(initial);
    const secondWorksheet = new Worksheet({
      id: worksheetId("worksheet-2"),
      name: worksheetName("Sheet2"),
    });
    await repositories.revisions.create(
      workbookChangeSet({
        workbookId: initial.workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [],
        nextWorksheets: [initial.worksheet, secondWorksheet],
      }),
    );
    const secondCell = cellId(secondWorksheet.id, cellAddress(1, 1));
    await repositories.revisions.create(
      numberChange(initial.workbook.id, secondWorksheet.id, 1, 1, 1, 42),
    );

    const deleted = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: initial.workbook.id,
        baseRevision: revisionNumber(2),
        cellChanges: [],
        nextWorksheets: [initial.worksheet],
      }),
    );

    expect(deleted.kind).toBe("created");
    if (deleted.kind === "created") {
      expect(deleted.state.revision.number).toBe(revisionNumber(3));
      expect(deleted.state.revision.worksheets).toEqual([initial.worksheet]);
      expect(deleted.state.revision.cells.has(secondCell)).toBe(false);
    }
  });

  it("削除済みWorksheetのCellを古いRevisionから編集するとEditConflictを返す", async () => {
    const repositories = createInMemoryRepositories();
    const initial = seed();
    await repositories.workbooks.create(initial);
    const secondWorksheet = new Worksheet({
      id: worksheetId("worksheet-2"),
      name: worksheetName("Sheet2"),
    });
    await repositories.revisions.create(
      workbookChangeSet({
        workbookId: initial.workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [],
        nextWorksheets: [initial.worksheet, secondWorksheet],
      }),
    );
    await repositories.revisions.create(
      workbookChangeSet({
        workbookId: initial.workbook.id,
        baseRevision: revisionNumber(1),
        cellChanges: [],
        nextWorksheets: [initial.worksheet],
      }),
    );
    const staleCell = cellId(secondWorksheet.id, cellAddress(1, 1));

    const stale = await repositories.revisions.create(
      numberChange(initial.workbook.id, secondWorksheet.id, 1, 1, 1, 42),
    );

    expect(stale).toEqual({
      kind: "edit-conflict",
      conflictingCellIds: [staleCell],
    });
  });

  it("対象Cellが重ならない古い編集を受け入れて連続するRevisionを作る", async () => {
    const repositories = createInMemoryRepositories();
    const initial = seed();
    await repositories.workbooks.create(initial);

    const first = await repositories.revisions.create(
      numberChange(initial.workbook.id, initial.worksheet.id, 0, 1, 1, 10),
    );
    const second = await repositories.revisions.create(
      numberChange(initial.workbook.id, initial.worksheet.id, 0, 1, 2, 20),
    );

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");
    if (second.kind !== "created") {
      return;
    }
    expect(second.state.revision.number).toBe(2);
    expect([...second.state.revision.cells.keys()]).toEqual([
      cellId(initial.worksheet.id, cellAddress(1, 1)),
      cellId(initial.worksheet.id, cellAddress(1, 2)),
    ]);
  });

  it("同じCellに対する古い編集を拒否する", async () => {
    const repositories = createInMemoryRepositories();
    const initial = seed();
    await repositories.workbooks.create(initial);

    await repositories.revisions.create(
      numberChange(initial.workbook.id, initial.worksheet.id, 0, 1, 1, 10),
    );
    const stale = await repositories.revisions.create(
      numberChange(initial.workbook.id, initial.worksheet.id, 0, 1, 1, 20),
    );

    expect(stale).toEqual({
      kind: "edit-conflict",
      conflictingCellIds: [cellId(initial.worksheet.id, cellAddress(1, 1))],
    });
  });

  it("後続の競合検出に使うため削除のtombstoneを保持する", async () => {
    const repositories = createInMemoryRepositories();
    const initial = seed();
    const target = cellId(initial.worksheet.id, cellAddress(3, 3));
    await repositories.workbooks.create(initial);

    await repositories.revisions.create(
      numberChange(initial.workbook.id, initial.worksheet.id, 0, 3, 3, 1),
    );
    const deleted = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: initial.workbook.id,
        baseRevision: revisionNumber(1),
        cellChanges: [{ cellId: target, content: null }],
      }),
    );
    const stale = await repositories.revisions.create(
      numberChange(initial.workbook.id, initial.worksheet.id, 1, 3, 3, 99),
    );

    expect(deleted.kind).toBe("created");
    if (deleted.kind === "created") {
      expect(deleted.state.revision.cells.has(target)).toBe(false);
    }
    expect(stale).toEqual({
      kind: "edit-conflict",
      conflictingCellIds: [target],
    });
  });

  it("永続状態モデルの定義どおり現在のRevisionだけを保持する", async () => {
    const repositories = createInMemoryRepositories();
    const initial = seed();
    await repositories.workbooks.create(initial);
    await repositories.revisions.create(
      numberChange(initial.workbook.id, initial.worksheet.id, 0, 1, 1, 10),
    );

    await expect(repositories.workbooks.find(initial.workbook.id)).resolves.toMatchObject({
      workbook: { currentRevision: 1 },
      revision: { number: 1 },
    });
  });
});
