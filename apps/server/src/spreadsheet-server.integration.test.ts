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

describe("サーバー側SQLite Repositoryの統合", () => {
  it("HTTP Repository経由で作成したWorksheetを永続化する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "gridline.sqlite3");
    const server = createSpreadsheetHttpServer({ databasePath });
    const address = await server.listen();
    const repositories = createHttpSpreadsheetRepositories({
      baseUrl: `${address.origin}/api`,
    });
    const created = await repositories.workbooks.create(seed());
    const secondWorksheet = new Worksheet({
      id: worksheetId("server-integration-sheet-2"),
      name: worksheetName("Sheet2"),
    });

    const revised = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: created.revision.number,
        cellChanges: [],
        nextWorksheets: [...created.revision.worksheets, secondWorksheet],
      }),
    );

    expect(revised.kind).toBe("created");
    if (revised.kind === "created") {
      expect(revised.state.revision.worksheets.map((sheet) => sheet.name)).toEqual([
        worksheetName("Sheet1"),
        worksheetName("Sheet2"),
      ]);
    }
    await server.close();
  });

  it("HTTP Repository経由でWorksheetとそのCellを削除する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "gridline.sqlite3");
    const firstServer = createSpreadsheetHttpServer({ databasePath });
    const firstAddress = await firstServer.listen();
    const firstRepositories = createHttpSpreadsheetRepositories({
      baseUrl: `${firstAddress.origin}/api`,
    });
    const created = await firstRepositories.workbooks.create(seed());
    const secondWorksheet = new Worksheet({
      id: worksheetId("server-integration-sheet-2"),
      name: worksheetName("Sheet2"),
    });
    const withSecond = await firstRepositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: created.revision.number,
        cellChanges: [],
        nextWorksheets: [...created.revision.worksheets, secondWorksheet],
      }),
    );
    if (withSecond.kind !== "created") {
      throw new Error("Expected the second Worksheet to be created.");
    }

    const deleted = await firstRepositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: withSecond.state.revision.number,
        cellChanges: [],
        nextWorksheets: [secondWorksheet],
      }),
    );
    await firstServer.close();

    const secondServer = createSpreadsheetHttpServer({ databasePath });
    const secondAddress = await secondServer.listen();
    const secondRepositories = createHttpSpreadsheetRepositories({
      baseUrl: `${secondAddress.origin}/api`,
    });
    const reopened = await secondRepositories.workbooks.find(created.workbook.id);

    expect(deleted.kind).toBe("created");
    expect(reopened?.revision.worksheets).toEqual([secondWorksheet]);
    expect(reopened?.revision.cells.size).toBe(0);
    await secondServer.close();
  });

  it("HTTPサーバーが同じSQLiteファイルを開き直した後もWorkbookを取得できる", async () => {
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

  it("同じCellへの古い変更にはEditConflictを返す", async () => {
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

  it("対象が異なるCellなら古いRevisionを基にした変更を受け入れる", async () => {
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

  it("古い編集との競合検出に使うため削除したCellのtombstoneを保持する", async () => {
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

  it("Worksheetの削除後はそのCellに対する古い変更を拒否する", async () => {
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
    const secondWorksheet = new Worksheet({
      id: worksheetId("server-integration-sheet-2"),
      name: worksheetName("Sheet2"),
    });
    const withSecond = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: created.revision.number,
        cellChanges: [],
        nextWorksheets: [...created.revision.worksheets, secondWorksheet],
      }),
    );
    if (withSecond.kind !== "created") {
      throw new Error("Expected the second Worksheet to be created.");
    }
    const deleted = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: withSecond.state.revision.number,
        cellChanges: [],
        nextWorksheets: created.revision.worksheets,
      }),
    );
    const staleTarget = cellId(secondWorksheet.id, parseA1Address("A1"));
    const staleContent = parseCellInput("99");
    if (staleContent === null) throw new Error("Expected stale CellContent.");

    const stale = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: withSecond.state.revision.number,
        cellChanges: [{ cellId: staleTarget, content: staleContent }],
      }),
    );

    expect(deleted.kind).toBe("created");
    expect(stale).toEqual({
      kind: "edit-conflict",
      conflictingCellIds: [staleTarget],
    });
    await server.close();
  });

  it("古いRevisionを基にしたWorksheet構造の変更を拒否する", async () => {
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
    const content = parseCellInput("43");
    if (target === undefined || content === null) {
      throw new Error("Expected a seeded Cell and CellContent.");
    }
    const edited = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: created.revision.number,
        cellChanges: [{ cellId: target, content }],
      }),
    );
    const secondWorksheet = new Worksheet({
      id: worksheetId("server-integration-sheet-2"),
      name: worksheetName("Sheet2"),
    });

    const stale = await repositories.revisions.create(
      workbookChangeSet({
        workbookId: created.workbook.id,
        baseRevision: created.revision.number,
        cellChanges: [],
        nextWorksheets: [...created.revision.worksheets, secondWorksheet],
      }),
    );

    expect(edited.kind).toBe("created");
    expect(stale).toEqual({
      kind: "revision-not-found",
      requestedRevision: created.revision.number,
    });
    await server.close();
  });
});
