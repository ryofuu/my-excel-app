import type { PrismaClient } from "./generated/client";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS workbooks (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    current_revision INTEGER NOT NULL CHECK (current_revision >= 0)
  )`,
  `CREATE TABLE IF NOT EXISTS worksheets (
    workbook_id TEXT NOT NULL,
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0),
    PRIMARY KEY (workbook_id, id),
    UNIQUE (workbook_id, position),
    UNIQUE (workbook_id, name),
    FOREIGN KEY (workbook_id) REFERENCES workbooks(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS cells (
    workbook_id TEXT NOT NULL,
    worksheet_id TEXT NOT NULL,
    row_number INTEGER NOT NULL CHECK (row_number > 0),
    column_number INTEGER NOT NULL CHECK (column_number > 0),
    content_json TEXT NULL,
    modified_revision INTEGER NOT NULL CHECK (modified_revision >= 0),
    PRIMARY KEY (workbook_id, worksheet_id, row_number, column_number),
    FOREIGN KEY (workbook_id, worksheet_id)
      REFERENCES worksheets(workbook_id, id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS cells_by_workbook
    ON cells(workbook_id, worksheet_id, row_number, column_number)`,
] as const;

/** 新規ローカルDBへ、Prisma Migrate と同じ Schema を初回起動時に用意する。 */
export const initializePrismaSchema = async (
  client: PrismaClient,
): Promise<void> => {
  await client.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await client.$queryRawUnsafe("PRAGMA journal_mode = WAL");
  for (const statement of schemaStatements) {
    await client.$executeRawUnsafe(statement);
  }
};
