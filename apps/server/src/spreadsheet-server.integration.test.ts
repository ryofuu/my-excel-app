import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellId,
  createWorkbookRevision,
  parseA1Address,
  parseCellInput,
  revisionNumber,
  workbookChangeSet,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
} from "@gridline/core/domain";
import { afterEach, describe, expect, it } from "vitest";

import {
  createSpreadsheetHttpServer,
  type SpreadsheetHttpServer,
} from "./presentation/http/spreadsheet-http-server.factory";
import {
  workbookFromResource,
  workbookResource,
} from "./presentation/http/workbook.resource";
import { createPrismaDatabase } from "./persistence/prisma/prisma-client.factory";

const temporaryDirectories: string[] = [];
const activeServers: SpreadsheetHttpServer[] = [];

const seed = (): Workbook => {
  const id = workbookId("server-integration-workbook");
  const sheetId = worksheetId("server-integration-sheet");
  const firstCellId = cellId(sheetId, parseA1Address("A1"));
  const formulaCellId = cellId(sheetId, parseA1Address("B1"));
  const firstRevision = revisionNumber(0);
  return new Workbook({
    id,
    name: workbookName("Server integration"),
    revision: new WorkbookRevision({
      number: firstRevision,
      worksheets: [
        new Worksheet({ id: sheetId, name: worksheetName("Sheet1") }),
      ],
      cells: new Map([
        [
          firstCellId,
          new Cell({
            id: firstCellId,
            content: parseCellInput("42"),
            modifiedRevision: firstRevision,
          }),
        ],
        [
          formulaCellId,
          new Cell({
            id: formulaCellId,
            content: parseCellInput("=A1+1"),
            modifiedRevision: firstRevision,
          }),
        ],
      ]),
    }),
  });
};

const startServer = async (databasePath: string) => {
  const server = createSpreadsheetHttpServer({ databasePath });
  activeServers.push(server);
  const address = await server.listen();
  return { server, baseUrl: `${address.origin}/api` };
};

const closeServer = async (server: SpreadsheetHttpServer) => {
  const index = activeServers.indexOf(server);
  if (index >= 0) activeServers.splice(index, 1);
  await server.close();
};

afterEach(async () => {
  await Promise.all(activeServers.splice(0).map((server) => server.close()));
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Hono + SQLite Workbook API integration", () => {
  it("Serverで生成したCalculationSnapshotを返して実行ごとに観測記録へ追記する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "gridline.sqlite3");
    const { server, baseUrl } = await startServer(databasePath);
    const workbook = seed();
    await fetch(`${baseUrl}/workbooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workbookResource(workbook)),
    });

    const generate = () =>
      fetch(
        `${baseUrl}/workbooks/${encodeURIComponent(String(workbook.id))}/calculation-observations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceRevision: 0 }),
        },
      );
    const first = await generate();
    const second = await generate();

    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({
      sourceRevision: 0,
      values: [
        {
          cellId: "server-integration-sheet!A1",
          value: { kind: "number", value: 42 },
        },
        {
          cellId: "server-integration-sheet!B1",
          value: { kind: "number", value: 43 },
        },
      ],
      trace: {
        dirtyCellIds: [
          "server-integration-sheet!A1",
          "server-integration-sheet!B1",
        ],
        evaluationOrder: ["server-integration-sheet!B1"],
        cycles: [],
      },
    });
    expect(second.status).toBe(201);
    const staleRevision = await fetch(
      `${baseUrl}/workbooks/${encodeURIComponent(String(workbook.id))}/calculation-observations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceRevision: 1 }),
      },
    );
    expect(staleRevision.status).toBe(409);

    await closeServer(server);
    const database = createPrismaDatabase(databasePath);
    try {
      await expect(
        database.client.calculationObservationRecord.count(),
      ).resolves.toBe(2);
    } finally {
      await database.close();
    }
  });

  it("Workbook集約を作成・更新し、Server再起動後も取得する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "gridline.sqlite3");
    const first = await startServer(databasePath);
    const workbook = seed();

    const created = await fetch(`${first.baseUrl}/workbooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workbookResource(workbook)),
    });
    expect(created.status).toBe(201);
    const duplicate = await fetch(`${first.baseUrl}/workbooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workbookResource(workbook)),
    });
    expect(duplicate.status).toBe(409);

    const target = [...workbook.revision.cells.keys()][0];
    if (target === undefined) throw new Error("Expected seeded Cell.");
    const creation = createWorkbookRevision(
      workbook,
      workbookChangeSet({
        workbookId: workbook.id,
        baseRevision: workbook.revision.number,
        cellChanges: [{ cellId: target, content: null }],
      }),
    );
    if (creation.kind !== "created") {
      throw new Error("Expected next WorkbookRevision.");
    }
    const updated = await fetch(
      `${first.baseUrl}/workbooks/${encodeURIComponent(String(workbook.id))}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workbook: workbookResource(creation.workbook),
          expectedRevision: 0,
        }),
      },
    );
    expect(updated.status).toBe(204);
    await closeServer(first.server);

    const second = await startServer(databasePath);
    const response = await fetch(
      `${second.baseUrl}/workbooks/${encodeURIComponent(String(workbook.id))}`,
    );
    const reopened = workbookFromResource(await response.json());

    expect(reopened.revision.number).toBe(1);
    expect(reopened.revision.cells.get(target)).toMatchObject({
      content: null,
      modifiedRevision: 1,
    });
  });

  it("期待Revisionが古い更新を409にする", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const { baseUrl } = await startServer(join(directory, "gridline.sqlite3"));
    const workbook = seed();
    await fetch(`${baseUrl}/workbooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workbookResource(workbook)),
    });

    const update = {
      workbook: workbookResource(workbook),
      expectedRevision: 1,
    };
    const response = await fetch(
      `${baseUrl}/workbooks/${encodeURIComponent(String(workbook.id))}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      },
    );

    expect(response.status).toBe(409);
  });

  it("ZodとDomain factoryで不完全なHTTP JSONを400にする", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const { baseUrl } = await startServer(join(directory, "gridline.sqlite3"));

    const response = await fetch(`${baseUrl}/workbooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "incomplete" }),
    });

    expect(response.status).toBe(400);

    const workbook = workbookResource(seed());
    const cell = workbook.revision.cells[0];
    if (cell === undefined) throw new Error("Expected seeded Cell.");
    const duplicateCellResponse = await fetch(`${baseUrl}/workbooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...workbook,
        revision: {
          ...workbook.revision,
          cells: [cell, cell],
        },
      }),
    });

    expect(duplicateCellResponse.status).toBe(400);
  });

  it("Workbookを削除する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-server-"));
    temporaryDirectories.push(directory);
    const { baseUrl } = await startServer(join(directory, "gridline.sqlite3"));
    const workbook = seed();
    await fetch(`${baseUrl}/workbooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workbookResource(workbook)),
    });

    const deleted = await fetch(
      `${baseUrl}/workbooks/${encodeURIComponent(String(workbook.id))}`,
      { method: "DELETE" },
    );
    const missing = await fetch(
      `${baseUrl}/workbooks/${encodeURIComponent(String(workbook.id))}`,
    );

    expect(deleted.status).toBe(204);
    expect(missing.status).toBe(404);
  });
});
