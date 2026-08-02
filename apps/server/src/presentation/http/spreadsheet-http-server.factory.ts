import { serve, type ServerType } from "@hono/node-server";

import { createPrismaDatabase } from "../../persistence/prisma/prisma-client.factory";
import { initializePrismaSchema } from "../../persistence/prisma/prisma-schema.initializer";
import { createPrismaCalculationObservationRepository } from "../../persistence/prisma/prisma-calculation-observation.repository";
import { createPrismaWorkbookRepository } from "../../persistence/prisma/prisma-workbook.repository";
import { createSpreadsheetHttpApp } from "./spreadsheet-http-app.factory";

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

const closeServer = (server: ServerType): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

export const createSpreadsheetHttpServer = (
  options: SpreadsheetHttpServerOptions,
): SpreadsheetHttpServer => {
  const hostname = options.hostname ?? "127.0.0.1";
  const port = options.port ?? 0;
  const database = createPrismaDatabase(options.databasePath);
  const initialized = initializePrismaSchema(database.client);
  const repositories = {
    workbooks: createPrismaWorkbookRepository(database.client),
    calculationObservations:
      createPrismaCalculationObservationRepository(database.client),
  };
  const app = createSpreadsheetHttpApp(repositories);
  let server: ServerType | undefined;

  return {
    listen: async () => {
      await initialized;
      return new Promise((resolve) => {
        server = serve(
          { fetch: app.fetch, hostname, port },
          (address) =>
            resolve({
              hostname,
              port: address.port,
              origin: `http://${hostname}:${address.port}`,
            }),
        );
      });
    },

    close: async () => {
      if (server !== undefined) {
        await closeServer(server);
        server = undefined;
      }
      await database.close();
    },
  };
};
