import { resolve } from "node:path";

import { createSpreadsheetHttpServer } from "./presentation/http/spreadsheet-http-server.factory.ts";

const databasePath =
  process.env.GRIDLINE_DATABASE_PATH ??
  resolve(import.meta.dirname, "../../../data/gridline.sqlite3");
const hostname = process.env.GRIDLINE_SERVER_HOST ?? "127.0.0.1";
const port = Number(process.env.GRIDLINE_SERVER_PORT ?? "8787");
if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) {
  throw new RangeError(`Invalid GRIDLINE_SERVER_PORT: ${process.env.GRIDLINE_SERVER_PORT}.`);
}

const server = createSpreadsheetHttpServer({ databasePath, hostname, port });
const address = await server.listen();
console.log(`Gridline server listening at ${address.origin}`);
console.log(`SQLite database: ${databasePath}`);

const shutdown = (): void => {
  void server.close().finally(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
