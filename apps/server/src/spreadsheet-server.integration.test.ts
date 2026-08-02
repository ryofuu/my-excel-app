import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellId,
  parseA1Address,
  parseCellInput,
  revisionNumber,
  workbookChangeSet,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
} from "@gridline/spreadsheet/domain";
import { createHttpSpreadsheetRepositories } from "@gridline/spreadsheet/infra";
import { afterEach, describe, expect, it } from "vitest";

import { createSpreadsheetHttpServer } from "./presentation/http/spreadsheet-http-server.factory";

const temporaryDirectories: string[] = [];

const seed = () => {
  const id = workbookId("server-integration-workbook");
  const sheetId = worksheetId("server-integration-sheet");
  const address = parseA1Address("A1");
  const firstCellId = cellId(sheetId, address);
  const firstRevision = revisionNumber(0);
  const content = parseCellInput("42");
  if (content === null) throw new Error("Expected CellContent for integration seed.");
  const revision = new WorkbookRevision({
    workbookId: id,
    number: firstRevision,
    worksheets: [new Worksheet({ id: sheetId, name: worksheetName("Sheet1") })],
    cells: new Map([
      [
        firstCellId,
        new Cell({
          id: firstCellId,
          content,
          modifiedRevision: firstRevision,
        }),
      ],
    ]),
  });
  return {
    workbook: new Workbook({
      id,
      name: workbookName("Server integration"),
      currentRevision: firstRevision,
    }),
    revision,
  };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("server-side SQLite Repository integration", () => {
  it("finds a Workbook after the HTTP server reopens the same SQLite file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "gridline.sqlite3");

    const firstServer = createSpreadsheetHttpServer({ databasePath });
    const firstAddress = await firstServer.listen();
    const firstRepositories = createHttpSpreadsheetRepositories({
      baseUrl: `${firstAddress.origin}/api`,
    });
    const created = await firstRepositories.workbooks.create(seed());
    await firstServer.close();

    const secondServer = createSpreadsheetHttpServer({ databasePath });
    const secondAddress = await secondServer.listen();
    const secondRepositories = createHttpSpreadsheetRepositories({
      baseUrl: `${secondAddress.origin}/api`,
    });
    const reopened = await secondRepositories.workbooks.find(created.workbook.id);

    expect(reopened?.revision.cells.values().next().value?.content).toEqual({
      kind: "literal",
      literal: { kind: "number", value: 42 },
    });
    await secondServer.close();
  });

  it("returns an EditConflict for a stale change to the same Cell", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const server = createSpreadsheetHttpServer({
      databasePath: join(directory, "gridline.sqlite3"),
    });
    const address = await server.listen();
    const repositories = createHttpSpreadsheetRepositories({
      baseUrl: `${address.origin}/api`,
    });
    const created = await repositories.workbooks.create(seed());
    const target = created.revision.cells.keys().next().value;
    if (target === undefined) throw new Error("Expected seeded Cell.");
    const firstContent = parseCellInput("43");
    const staleContent = parseCellInput("44");
    if (firstContent === null || staleContent === null) {
      throw new Error("Expected CellContent for conflict test.");
    }

    const first = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [{ cellId: target, content: firstContent }],
      }),
    );
    const stale = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [{ cellId: target, content: staleContent }],
      }),
    );

    expect(first.kind).toBe("created");
    expect(stale).toEqual({
      kind: "edit-conflict",
      conflictingCellIds: [target],
    });
    await server.close();
  });

  it("accepts stale changes when they target different Cells", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const server = createSpreadsheetHttpServer({
      databasePath: join(directory, "gridline.sqlite3"),
    });
    const address = await server.listen();
    const repositories = createHttpSpreadsheetRepositories({
      baseUrl: `${address.origin}/api`,
    });
    const created = await repositories.workbooks.create(seed());
    const firstTarget = created.revision.cells.keys().next().value;
    const sheet = created.revision.worksheets[0];
    if (firstTarget === undefined || sheet === undefined) {
      throw new Error("Expected seeded Worksheet and Cell.");
    }
    const secondTarget = cellId(sheet.id, parseA1Address("B1"));
    const firstContent = parseCellInput("43");
    const secondContent = parseCellInput("20");
    if (firstContent === null || secondContent === null) {
      throw new Error("Expected CellContent for disjoint edit test.");
    }

    const first = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [{ cellId: firstTarget, content: firstContent }],
      }),
    );
    const second = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [{ cellId: secondTarget, content: secondContent }],
      }),
    );

    expect(first.kind).toBe("created");
    expect(second.kind).toBe("created");
    if (second.kind === "created") {
      expect(second.state.revision.number).toBe(revisionNumber(2));
      expect([...second.state.revision.cells.keys()]).toEqual([
        firstTarget,
        secondTarget,
      ]);
    }
    await server.close();
  });

  it("retains a deleted Cell tombstone for stale edit detection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const server = createSpreadsheetHttpServer({
      databasePath: join(directory, "gridline.sqlite3"),
    });
    const address = await server.listen();
    const repositories = createHttpSpreadsheetRepositories({
      baseUrl: `${address.origin}/api`,
    });
    const created = await repositories.workbooks.create(seed());
    const target = created.revision.cells.keys().next().value;
    if (target === undefined) throw new Error("Expected seeded Cell.");
    const staleContent = parseCellInput("99");
    if (staleContent === null) throw new Error("Expected stale CellContent.");

    const deleted = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [{ cellId: target, content: null }],
      }),
    );
    const stale = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [{ cellId: target, content: staleContent }],
      }),
    );

    expect(deleted.kind).toBe("created");
    if (deleted.kind === "created") {
      expect(deleted.state.revision.cells.has(target)).toBe(false);
    }
    expect(stale).toEqual({
      kind: "edit-conflict",
      conflictingCellIds: [target],
    });
    await server.close();
  });
});
