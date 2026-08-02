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
} from "./sqlite-workbook.dto.ts";
import { execute, query, transaction, type SqlDatabase, type SqlRow } from "./sqlite.database.ts";
import { schemaSql } from "./sqlite.schema.ts";

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
    throw new TypeError("Expected cells.content_json to be a string.");
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
  const worksheetId = asString(row.worksheet_id, "cells.worksheet_id");
  const rowNumber = asNumber(row.row_number, "cells.row_number");
  const column = asNumber(row.column_number, "cells.column_number");
  return {
    cellId: cellIdFor(worksheetId, rowNumber, column),
    worksheetId,
    row: rowNumber,
    column,
    content: parseContent(row.content_json),
    modifiedRevision: asNumber(
      row.modified_revision,
      "cells.modified_revision",
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
       FROM cells
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
    `INSERT INTO cells
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
       FROM cells
      WHERE workbook_id = ?
        AND worksheet_id = ?
        AND row_number = ?
        AND column_number = ?`,
    [workbookId, cell.worksheetId, cell.row, cell.column],
  )[0];
  return row ? asNumber(row.modified_revision, "cells.modified_revision") : null;
};

const assertDistinctCellChanges = (cells: readonly CellStateDto[]): void => {
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

const assertNextWorksheets = (
  worksheets: readonly WorksheetDto[] | undefined,
): void => {
  if (worksheets === undefined) return;
  if (worksheets.length === 0) {
    throw new RangeError("WorkbookChangeSet must retain at least one Worksheet.");
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  worksheets.forEach((worksheet, position) => {
    if (worksheet.id.trim().length === 0 || worksheet.id.includes("!")) {
      throw new RangeError(`Invalid Worksheet id: ${worksheet.id}.`);
    }
    if (worksheet.name.trim().length === 0) {
      throw new RangeError("Worksheet name must not be empty.");
    }
    if (worksheet.position !== position) {
      throw new RangeError("Worksheet positions must be contiguous and ordered.");
    }
    if (ids.has(worksheet.id)) {
      throw new RangeError(`Duplicate Worksheet id: ${worksheet.id}.`);
    }
    if (names.has(worksheet.name)) {
      throw new RangeError(`Duplicate Worksheet name: ${worksheet.name}.`);
    }
    ids.add(worksheet.id);
    names.add(worksheet.name);
  });
};

const persistWorksheetSnapshot = (
  database: SqlDatabase,
  workbookId: string,
  worksheets: readonly WorksheetDto[],
): void => {
  const nextIds = new Set(worksheets.map((worksheet) => worksheet.id));
  const current = query(
    database,
    `SELECT id, name, position
       FROM worksheets
      WHERE workbook_id = ?
      ORDER BY position ASC`,
    [workbookId],
  ).map(readWorksheet);

  for (const worksheet of current) {
    if (!nextIds.has(worksheet.id)) {
      execute(
        database,
        "DELETE FROM worksheets WHERE workbook_id = ? AND id = ?",
        [workbookId, worksheet.id],
      );
    }
  }

  const currentById = new Map(
    current.map((worksheet) => [worksheet.id, worksheet]),
  );
  for (const worksheet of worksheets) {
    const existing = currentById.get(worksheet.id);
    if (existing === undefined) {
      execute(
        database,
        `INSERT INTO worksheets (workbook_id, id, name, position)
         VALUES (?, ?, ?, ?)`,
        [workbookId, worksheet.id, worksheet.name, worksheet.position],
      );
      continue;
    }
    execute(
      database,
      `UPDATE worksheets
          SET name = ?, position = ?
        WHERE workbook_id = ? AND id = ?`,
      [worksheet.name, worksheet.position, workbookId, worksheet.id],
    );
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
 * Applies sparse Cell changes and, when supplied, the complete ordered
 * Worksheet snapshot. Cell tombstones make a stale delete conflict like an
 * edit; structural snapshots require the current revision.
 */
export const createWorkbookRevisionInDatabase = (
  database: SqlDatabase,
  changeSet: WorkbookChangeSetDto,
): WorkbookRevisionCreateDtoResult =>
  transaction(database, () => {
    if (
      changeSet.cellChanges.length === 0 &&
      changeSet.nextWorksheets === undefined
    ) {
      throw new RangeError("WorkbookChangeSet must change Cells or Worksheets.");
    }
    assertDistinctCellChanges(changeSet.cellChanges);
    assertNextWorksheets(changeSet.nextWorksheets);
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
    if (
      changeSet.nextWorksheets !== undefined &&
      changeSet.baseRevision !== workbook.currentRevision
    ) {
      return {
        kind: "revision-not-found",
        requestedRevision: changeSet.baseRevision,
      };
    }

    const currentRevision = findRevision(
      database,
      changeSet.workbookId,
      workbook.currentRevision,
    );
    if (currentRevision === null) {
      throw new Error("Current WorkbookRevision could not be read from the database.");
    }
    const nextWorksheets =
      changeSet.nextWorksheets ?? currentRevision.worksheets;
    const nextWorksheetIds = new Set(
      nextWorksheets.map((worksheet) => worksheet.id),
    );
    const cellsWithoutWorksheet = changeSet.cellChanges
      .filter((cell) => !nextWorksheetIds.has(cell.worksheetId))
      .map((cell) => cell.cellId);
    if (cellsWithoutWorksheet.length > 0) {
      if (
        changeSet.nextWorksheets === undefined &&
        changeSet.baseRevision < workbook.currentRevision
      ) {
        return {
          kind: "edit-conflict",
          conflictingCellIds: cellsWithoutWorksheet,
        };
      }
      throw new RangeError(
        "CellChange targets a Worksheet absent from the next revision.",
      );
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
    if (changeSet.nextWorksheets !== undefined) {
      persistWorksheetSnapshot(
        database,
        changeSet.workbookId,
        changeSet.nextWorksheets,
      );
    }
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
