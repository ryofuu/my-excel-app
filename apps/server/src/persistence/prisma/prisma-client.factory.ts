import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "./generated/client";

export type PrismaDatabase = Readonly<{
  client: PrismaClient;
  close: () => Promise<void>;
}>;

export const createPrismaDatabase = (databasePath: string): PrismaDatabase => {
  const resolvedPath = resolve(databasePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const adapter = new PrismaBetterSqlite3({
    url: pathToFileURL(resolvedPath).href,
  });
  const client = new PrismaClient({ adapter });

  return {
    client,
    close: () => client.$disconnect(),
  };
};
