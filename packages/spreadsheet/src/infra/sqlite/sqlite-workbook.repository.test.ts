import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createWorkbookInDatabase,
  createWorkbookRevisionInDatabase,
  findWorkbookInDatabase,
  initializeDatabase,
} from "./sqlite-workbook.repository";
import type { CellStateDto, WorkbookSeedDto } from "./sqlite-workbook.dto";
import type { SqlDatabase } from "./sqlite.database";

type ClosableDatabase = SqlDatabase & Readonly<{ close: () => unknown }>;

const literal = (value: number) => ({
  kind: "literal" as const,
  literal: { kind: "number" as const, value },
});

const cell = (
  row: number,
  column: number,
  content: CellStateDto["content"],
): CellStateDto => ({
  cellId: `sheet-1!${String.fromCharCode(64 + column)}${row}`,
  worksheetId: "sheet-1",
  row,
  column,
  content,
  modifiedRevision: 0,
});

const seed = (): WorkbookSeedDto => ({
  workbook: { id: "workbook-1", name: "Budget", currentRevision: 0 },
  revision: {
    workbookId: "workbook-1",
    number: 0,
    worksheets: [{ id: "sheet-1", name: "Sheet1", position: 0 }],
    cells: [],
  },
});

describe("SQLite workbook transaction semantics", () => {
  let database: ClosableDatabase;

  beforeEach(async () => {
    const sqlite3 = await sqlite3InitModule();
    database = new sqlite3.oo1.DB(":memory:", "ct") as unknown as ClosableDatabase;
    initializeDatabase(database);
    createWorkbookInDatabase(database, seed());
  });

  afterEach(() => {
    database.close();
  });

  it("accepts disjoint stale edits and returns the complete current revision", () => {
    const first = createWorkbookRevisionInDatabase(database, {
      workbookId: "workbook-1",
      baseRevision: 0,
      cellChanges: [cell(1, 1, literal(10))],
    });
    const second = createWorkbookRevisionInDatabase(database, {
      workbookId: "workbook-1",
      baseRevision: 0,
      cellChanges: [cell(1, 2, literal(20))],
    });

    expect(first.kind).toBe("created");
    expect(second).toMatchObject({ kind: "created" });
    if (second.kind === "created") {
      expect(second.state.revision.number).toBe(2);
      expect(second.state.revision.cells.map((entry) => entry.cellId)).toEqual([
        "sheet-1!A1",
        "sheet-1!B1",
      ]);
    }
  });

  it("detects a stale same-cell update and a stale edit after deletion", () => {
    const target = cell(2, 1, literal(1));
    createWorkbookRevisionInDatabase(database, {
      workbookId: "workbook-1",
      baseRevision: 0,
      cellChanges: [target],
    });
    const deleted = createWorkbookRevisionInDatabase(database, {
      workbookId: "workbook-1",
      baseRevision: 1,
      cellChanges: [{ ...target, content: null }],
    });
    const stale = createWorkbookRevisionInDatabase(database, {
      workbookId: "workbook-1",
      baseRevision: 1,
      cellChanges: [{ ...target, content: literal(99) }],
    });

    expect(deleted.kind).toBe("created");
    expect(stale).toEqual({
      kind: "edit-conflict",
      conflictingCellIds: ["sheet-1!A2"],
    });
    expect(findWorkbookInDatabase(database, "workbook-1")).toMatchObject({
      workbook: { currentRevision: 2 },
      revision: { number: 2, cells: [] },
    });
  });
});
