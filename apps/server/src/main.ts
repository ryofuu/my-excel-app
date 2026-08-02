import { resolve } from "node:path";
import * as z from "zod";

import { createSpreadsheetHttpServer } from "./presentation/http/spreadsheet-http-server.factory.ts";

const environment = z
  .object({
    databasePath: z.string().min(1),
    hostname: z.string().min(1),
    port: z.coerce.number().int().min(0).max(65_535),
  })
  .parse({
    databasePath:
      process.env.GRIDLINE_DATABASE_PATH ??
      resolve(import.meta.dirname, "../../../data/gridline.sqlite3"),
    hostname: process.env.GRIDLINE_SERVER_HOST ?? "127.0.0.1",
    port: process.env.GRIDLINE_SERVER_PORT ?? "8787",
  });

const server = createSpreadsheetHttpServer(environment);
const address = await server.listen();
console.log(`Gridline server listening at ${address.origin}`);
console.log(`SQLite database: ${environment.databasePath}`);

const shutdown = (): void => {
  void server.close().finally(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
