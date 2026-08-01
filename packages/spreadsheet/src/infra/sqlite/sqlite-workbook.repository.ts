import type {
  CellContentDto,
  CellStateDto,
  WorkbookChangeSetDto,
  WorkbookDto,
  WorkbookRevisionCreateDtoResult,
  WorkbookRevisionDto,
  WorkbookSeedDto,
  WorkbookStateDto,
  WorksheetDto,
} from "./sqlite-workbook.dto";
import { execute, query, transaction, type SqlDatabase, type SqlRow } from "./sqlite.database";
import { schemaSql } from "./sqlite.schema";

const asString = (value: unknown, field: string): string => {
  if (typeof value !== "string") {
    throw new TypeError(`Expected ${field} to be a string.`);
  }
  return value;
};

const asNumber = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new TypeError(`Expected ${field} to be a safe integer.`);
  }
  return value;
};

const readWorkbook = (row: SqlRow): WorkbookDto => ({
  id: asString(row.id, "workbooks.id"),
  name: asString(row.name, "workbooks.name"),
  currentRevision: asNumber(row.current_revision, "workbooks.current_revision"),
});

const readWorksheet = (row: SqlRow): WorksheetDto => ({
  id: asString(row.id, "worksheets.id"),
  name: asString(row.name, "worksheets.name"),
  position: asNumber(row.position, "worksheets.position"),
});

const parseContent = (value: unknown): CellContentDto => {
  if (typeof value !== "string") {
    throw new TypeError("Expected cell_states.content_json to be a string.");
  }
  const content: unknown = JSON.parse(value);
  if (!content || typeof content !== "object" || !("kind" in content)) {
    throw new TypeError("Invalid cell content in database.");
  }
  return content as CellContentDto;
};

const formatColumn = (column: number): string => {
  let current = column;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
};

const cellIdFor = (worksheetId: string, row: number, column: number): string =>
  `${worksheetId}!${formatColumn(column)}${row}`;

const readCell = (row: SqlRow): CellStateDto => {
  const worksheetId = asString(row.worksheet_id, "cell_states.worksheet_id");
  const rowNumber = asNumber(row.row_number, "cell_states.row_number");
  const column = asNumber(row.column_number, "cell_states.column_number");
  return {
    cellId: cellIdFor(worksheetId, rowNumber, column),
    worksheetId,
    row: rowNumber,
    column,
    content: parseContent(row.content_json),
    modifiedRevision: asNumber(
      row.modified_revision,
      "cell_states.modified_revision",
    ),
  };
};

const findWorkbookRow = (
  database: SqlDatabase,
  workbookId: string,
): WorkbookDto | null => {
  const row = query(
    database,
    "SELECT id, name, current_revision FROM workbooks WHERE id = ?",
    [workbookId],
  )[0];
  return row ? readWorkbook(row) : null;
};

const findRevision = (
  database: SqlDatabase,
  workbookId: string,
  revision: number,
): WorkbookRevisionDto | null => {
  const workbook = findWorkbookRow(database, workbookId);
  if (!workbook || workbook.currentRevision !== revision) {
    return null;
  }

  const worksheets = query(
    database,
    `SELECT id, name, position
       FROM worksheets
      WHERE workbook_id = ?
      ORDER BY position ASC`,
    [workbookId],
  ).map(readWorksheet);
  const cells = query(
    database,
    `SELECT worksheet_id, row_number, column_number, content_json, modified_revision
       FROM cell_states
      WHERE workbook_id = ?
        AND content_json IS NOT NULL
      ORDER BY worksheet_id ASC, row_number ASC, column_number ASC`,
    [workbookId],
  ).map(readCell);

  return {
    workbookId,
    number: revision,
    worksheets,
    cells,
  };
};

const persistCell = (
  database: SqlDatabase,
  workbookId: string,
  cell: CellStateDto,
  modifiedRevision: number,
): void => {
  execute(
    database,
    `INSERT INTO cell_states
       (workbook_id, worksheet_id, row_number, column_number, content_json, modified_revision)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(workbook_id, worksheet_id, row_number, column_number)
     DO UPDATE SET
       content_json = excluded.content_json,
       modified_revision = excluded.modified_revision`,
    [
      workbookId,
      cell.worksheetId,
      cell.row,
      cell.column,
      cell.content === null ? null : JSON.stringify(cell.content),
      modifiedRevision,
    ],
  );
};

const modifiedRevisionFor = (
  database: SqlDatabase,
  workbookId: string,
  cell: CellStateDto,
): number | null => {
  const row = query(
    database,
    `SELECT modified_revision
       FROM cell_states
      WHERE workbook_id = ?
        AND worksheet_id = ?
        AND row_number = ?
        AND column_number = ?`,
    [workbookId, cell.worksheetId, cell.row, cell.column],
  )[0];
  return row ? asNumber(row.modified_revision, "cell_states.modified_revision") : null;
};

const assertDistinctCellChanges = (cells: readonly CellStateDto[]): void => {
  if (cells.length === 0) {
    throw new RangeError("WorkbookChangeSet must contain at least one CellChange.");
  }
  const seen = new Set<string>();
  for (const cell of cells) {
    if (cell.cellId !== cellIdFor(cell.worksheetId, cell.row, cell.column)) {
      throw new RangeError(`Cell DTO does not match its coordinates: ${cell.cellId}.`);
    }
    const coordinate = `${cell.worksheetId}:${cell.row}:${cell.column}`;
    if (seen.has(coordinate)) {
      throw new RangeError(
        `A WorkbookChangeSet may change a cell only once (${cell.cellId}).`,
      );
    }
    seen.add(coordinate);
  }
};

export const initializeDatabase = (database: SqlDatabase): void => {
  execute(database, schemaSql);
};

export const createWorkbookInDatabase = (
  database: SqlDatabase,
  seed: WorkbookSeedDto,
): WorkbookStateDto =>
  transaction(database, () => {
    if (seed.workbook.id !== seed.revision.workbookId) {
      throw new RangeError("Workbook and initial revision must have the same id.");
    }
    if (seed.workbook.currentRevision !== seed.revision.number) {
      throw new RangeError("Workbook and initial revision must have the same number.");
    }
    if (seed.revision.number !== 0) {
      throw new RangeError("The initial workbook revision must be 0.");
    }
    if (seed.revision.worksheets.length === 0) {
      throw new RangeError("The initial revision must contain at least one worksheet.");
    }

    execute(
      database,
      "INSERT INTO workbooks (id, name, current_revision) VALUES (?, ?, ?)",
      [seed.workbook.id, seed.workbook.name, seed.workbook.currentRevision],
    );
    for (const worksheet of seed.revision.worksheets) {
      execute(
        database,
        `INSERT INTO worksheets (workbook_id, id, name, position)
         VALUES (?, ?, ?, ?)`,
        [seed.workbook.id, worksheet.id, worksheet.name, worksheet.position],
      );
    }
    for (const cell of seed.revision.cells) {
      if (cell.content === null) {
        throw new RangeError("An initial revision cannot contain a tombstone.");
      }
      if (cell.modifiedRevision !== 0) {
        throw new RangeError("An initial cell must have modified revision 0.");
      }
      if (cell.cellId !== cellIdFor(cell.worksheetId, cell.row, cell.column)) {
        throw new RangeError(`Cell DTO does not match its coordinates: ${cell.cellId}.`);
      }
      persistCell(database, seed.workbook.id, cell, cell.modifiedRevision);
    }
    return seed;
  });

export const findWorkbookInDatabase = (
  database: SqlDatabase,
  workbookId: string,
): WorkbookStateDto | null =>
  transaction(database, () => {
    const workbook = findWorkbookRow(database, workbookId);
    if (!workbook) {
      return null;
    }
    const revision = findRevision(
      database,
      workbook.id,
      workbook.currentRevision,
    );
    if (!revision) {
      throw new Error("Current WorkbookRevision could not be read from the database.");
    }
    return { workbook, revision };
  });

export const deleteWorkbookInDatabase = (
  database: SqlDatabase,
  workbookId: string,
): void => {
  execute(database, "DELETE FROM workbooks WHERE id = ?", [workbookId]);
};

/**
 * Applies just the changed cell rows.  Tombstones remain in `cell_states`, so
 * a delete made after the caller's base revision conflicts just like an edit.
 */
export const createWorkbookRevisionInDatabase = (
  database: SqlDatabase,
  changeSet: WorkbookChangeSetDto,
): WorkbookRevisionCreateDtoResult =>
  transaction(database, () => {
    assertDistinctCellChanges(changeSet.cellChanges);
    const workbook = findWorkbookRow(database, changeSet.workbookId);
    if (!workbook) {
      return { kind: "workbook-not-found" };
    }
    if (
      !Number.isSafeInteger(changeSet.baseRevision) ||
      changeSet.baseRevision < 0 ||
      changeSet.baseRevision > workbook.currentRevision
    ) {
      return {
        kind: "revision-not-found",
        requestedRevision: changeSet.baseRevision,
      };
    }

    const conflictingCellIds = changeSet.cellChanges
      .filter((cell) => {
        const modifiedRevision = modifiedRevisionFor(
          database,
          changeSet.workbookId,
          cell,
        );
        return modifiedRevision !== null && modifiedRevision > changeSet.baseRevision;
      })
      .map((cell) => cell.cellId);

    if (conflictingCellIds.length > 0) {
      return { kind: "edit-conflict", conflictingCellIds };
    }

    const nextRevision = workbook.currentRevision + 1;
    for (const cell of changeSet.cellChanges) {
      persistCell(database, changeSet.workbookId, cell, nextRevision);
    }
    execute(
      database,
      "UPDATE workbooks SET current_revision = ? WHERE id = ?",
      [nextRevision, changeSet.workbookId],
    );

    const revision = findRevision(database, changeSet.workbookId, nextRevision);
    if (!revision) {
      throw new Error("Created revision could not be read from the database.");
    }
    return {
      kind: "created",
      state: {
        workbook: { ...workbook, currentRevision: nextRevision },
        revision,
      },
    };
  });
