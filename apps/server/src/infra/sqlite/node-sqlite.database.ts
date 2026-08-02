import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { SqlDatabase, SqlRow } from "@gridline/spreadsheet/infra/server";

export type NodeSqliteDatabase = Readonly<{
  database: SqlDatabase;
  close: () => void;
}>;

export const createNodeSqliteDatabase = (
  databasePath: string,
): NodeSqliteDatabase => {
  const resolvedPath = resolve(databasePath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  const sqlite = new DatabaseSync(resolvedPath, { timeout: 5_000 });

  return {
    database: {
      exec: ({ sql, bind = [], resultRows }) => {
        if (bind.length === 0 && resultRows === undefined) {
          sqlite.exec(sql);
          return;
        }
        const statement = sqlite.prepare(sql);
        if (resultRows !== undefined) {
          resultRows.push(...(statement.all(...bind) as SqlRow[]));
          return;
        }
        statement.run(...bind);
      },
    },
    close: () => sqlite.close(),
  };
};
