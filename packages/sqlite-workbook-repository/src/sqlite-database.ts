/** The small OO1 subset used by the repository and easy to fake in tests. */
export type SqlRow = Record<string, unknown>;

export type SqlDatabase = Readonly<{
  exec: (options: Readonly<{
    sql: string;
    bind?: readonly (string | number | null)[];
    rowMode?: "object";
    resultRows?: SqlRow[];
  }>) => unknown;
  close?: () => unknown;
}>;

export const execute = (
  database: SqlDatabase,
  sql: string,
  bind?: readonly (string | number | null)[],
): void => {
  database.exec({ sql, bind });
};

export const query = (
  database: SqlDatabase,
  sql: string,
  bind?: readonly (string | number | null)[],
): readonly SqlRow[] => {
  const resultRows: SqlRow[] = [];
  database.exec({ sql, bind, rowMode: "object", resultRows });
  return resultRows;
};

/** SQLite transactions must stay inside one Worker message. */
export const transaction = <Result>(
  database: SqlDatabase,
  action: () => Result,
): Result => {
  execute(database, "BEGIN IMMEDIATE");
  try {
    const result = action();
    execute(database, "COMMIT");
    return result;
  } catch (error) {
    try {
      execute(database, "ROLLBACK");
    } catch {
      // The original error is the useful one, including a failed BEGIN.
    }
    throw error;
  }
};
