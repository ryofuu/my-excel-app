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
  `CREATE TABLE IF NOT EXISTS calculation_observations (
    id TEXT PRIMARY KEY NOT NULL,
    workbook_id TEXT NOT NULL,
    source_revision INTEGER NOT NULL CHECK (source_revision >= 0),
    observed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    graph_json TEXT NOT NULL,
    trace_json TEXT NOT NULL,
    FOREIGN KEY (workbook_id) REFERENCES workbooks(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS calculation_cell_values (
    observation_id TEXT NOT NULL,
    worksheet_id TEXT NOT NULL,
    row_number INTEGER NOT NULL CHECK (row_number > 0),
    column_number INTEGER NOT NULL CHECK (column_number > 0),
    kind TEXT NOT NULL,
    number_value REAL NULL,
    text_value TEXT NULL,
    boolean_value BOOLEAN NULL,
    error_code TEXT NULL,
    error_origin_cell_id TEXT NULL,
    error_message TEXT NULL,
    formula_analysis_json TEXT NULL,
    PRIMARY KEY (observation_id, worksheet_id, row_number, column_number),
    FOREIGN KEY (observation_id)
      REFERENCES calculation_observations(id) ON DELETE CASCADE,
    CHECK (
      (kind = 'blank' AND number_value IS NULL AND text_value IS NULL AND boolean_value IS NULL AND error_code IS NULL AND error_origin_cell_id IS NULL AND error_message IS NULL)
      OR (kind = 'number' AND number_value IS NOT NULL AND text_value IS NULL AND boolean_value IS NULL AND error_code IS NULL AND error_origin_cell_id IS NULL AND error_message IS NULL)
      OR (kind = 'text' AND number_value IS NULL AND text_value IS NOT NULL AND boolean_value IS NULL AND error_code IS NULL AND error_origin_cell_id IS NULL AND error_message IS NULL)
      OR (kind = 'boolean' AND number_value IS NULL AND text_value IS NULL AND boolean_value IS NOT NULL AND error_code IS NULL AND error_origin_cell_id IS NULL AND error_message IS NULL)
      OR (kind = 'error' AND number_value IS NULL AND text_value IS NULL AND boolean_value IS NULL AND error_code IS NOT NULL AND error_origin_cell_id IS NOT NULL AND error_message IS NOT NULL)
    )
  )`,
  `CREATE INDEX IF NOT EXISTS calculation_observations_by_revision
    ON calculation_observations(workbook_id, source_revision, observed_at)`,
  `CREATE INDEX IF NOT EXISTS calculation_values_by_cell
    ON calculation_cell_values(worksheet_id, row_number, column_number)`,
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
