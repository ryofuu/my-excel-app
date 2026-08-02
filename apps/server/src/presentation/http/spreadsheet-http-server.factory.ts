import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import {
  createWorkbookInDatabase,
  createWorkbookRevisionInDatabase,
  deleteWorkbookInDatabase,
  findWorkbookInDatabase,
  initializeDatabase,
  type WorkbookChangeSetDto,
  type WorkbookSeedDto,
} from "@gridline/spreadsheet/infra/server";

import { createNodeSqliteDatabase } from "../../infra/sqlite/node-sqlite.database.ts";

export type SpreadsheetHttpServerOptions = Readonly<{
  databasePath: string;
  hostname?: string;
  port?: number;
}>;

export type SpreadsheetHttpServerAddress = Readonly<{
  hostname: string;
  port: number;
  origin: string;
}>;

export type SpreadsheetHttpServer = Readonly<{
  listen: () => Promise<SpreadsheetHttpServerAddress>;
  close: () => Promise<void>;
}>;

const requestBody = async <Body>(request: IncomingMessage): Promise<Body> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > 1_000_000) {
      throw new RangeError("Request body exceeds 1 MB.");
    }
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Body;
};

const json = (
  response: ServerResponse,
  status: number,
  body: unknown,
): void => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
};

const errorStatus = (error: unknown): number => {
  if (error instanceof SyntaxError || error instanceof TypeError || error instanceof RangeError) {
    return 400;
  }
  return 500;
};

export const createSpreadsheetHttpServer = (
  options: SpreadsheetHttpServerOptions,
): SpreadsheetHttpServer => {
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;
  const sqlite = createNodeSqliteDatabase(options.databasePath);
  initializeDatabase(sqlite.database);

  const server = createServer((request, response) => {
    void (async () => {
      const method = request.method ?? "GET";
      const url = new URL(request.url ?? "/", `http://${hostname}`);

      if (method === "POST" && url.pathname === "/api/workbooks") {
        const seed = await requestBody<WorkbookSeedDto>(request);
        json(response, 201, createWorkbookInDatabase(sqlite.database, seed));
        return;
      }

      const workbookMatch = /^\/api\/workbooks\/([^/]+)$/.exec(url.pathname);
      if (workbookMatch !== null) {
        const workbookId = decodeURIComponent(workbookMatch[1] ?? "");
        if (method === "GET") {
          const state = findWorkbookInDatabase(sqlite.database, workbookId);
          if (state === null) {
            json(response, 404, { error: { message: "Workbook not found." } });
            return;
          }
          json(response, 200, state);
          return;
        }
        if (method === "DELETE") {
          deleteWorkbookInDatabase(sqlite.database, workbookId);
          response.writeHead(204);
          response.end();
          return;
        }
      }

      if (method === "POST" && url.pathname === "/api/workbook-revisions") {
        const changeSet = await requestBody<WorkbookChangeSetDto>(request);
        json(
          response,
          200,
          createWorkbookRevisionInDatabase(sqlite.database, changeSet),
        );
        return;
      }

      json(response, 404, { error: { message: "Resource not found." } });
    })().catch((error: unknown) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined);
        return;
      }
      json(response, errorStatus(error), {
        error: {
          message: error instanceof Error ? error.message : "Unexpected server error.",
        },
      });
    });
  });

  let closed = false;
  return {
    listen: () =>
      new Promise<SpreadsheetHttpServerAddress>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, hostname, () => {
          server.off("error", reject);
          const address = server.address() as AddressInfo;
          resolve({
            hostname,
            port: address.port,
            origin: `http://${hostname}:${address.port}`,
          });
        });
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        if (closed) {
          resolve();
          return;
        }
        closed = true;
        server.close((error) => {
          sqlite.close();
          if (error) reject(error);
          else resolve();
        });
      }),
  };
};
