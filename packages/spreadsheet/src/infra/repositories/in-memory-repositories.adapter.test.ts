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

describe("in-memory workbook repositories", () => {
  it("accepts disjoint stale edits while creating a sequential revision", async () => {
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
    expect(second.revision.number).toBe(2);
    expect([...second.revision.cells.keys()]).toEqual([
      cellId(initial.worksheet.id, cellAddress(1, 1)),
      cellId(initial.worksheet.id, cellAddress(1, 2)),
    ]);
  });

  it("rejects a stale edit to the same cell", async () => {
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

  it("retains a delete tombstone for subsequent stale conflict detection", async () => {
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
      expect(deleted.revision.cells.has(target)).toBe(false);
    }
    expect(stale).toEqual({
      kind: "edit-conflict",
      conflictingCellIds: [target],
    });
  });

  it("keeps only the current revision as the durable-state model specifies", async () => {
    const repositories = createInMemoryRepositories();
    const initial = seed();
    await repositories.workbooks.create(initial);
    await repositories.revisions.create(
      numberChange(initial.workbook.id, initial.worksheet.id, 0, 1, 1, 10),
    );

    await expect(repositories.revisions.find(initial.workbook.id, 0)).resolves.toBeNull();
    await expect(repositories.revisions.find(initial.workbook.id, 1)).resolves.toMatchObject({
      number: 1,
    });
  });
});
