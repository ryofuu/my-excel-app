/** Plain representations shared by the HTTP and SQLite boundaries. */
export type LiteralDto =
  | Readonly<{ kind: "number"; value: number }>
  | Readonly<{ kind: "text"; value: string }>
  | Readonly<{ kind: "boolean"; value: boolean }>;

export type CellContentDto =
  | Readonly<{ kind: "literal"; literal: LiteralDto }>
  | Readonly<{ kind: "formula"; source: string }>;

export type WorkbookDto = Readonly<{
  id: string;
  name: string;
  currentRevision: number;
}>;

export type WorksheetDto = Readonly<{
  id: string;
  name: string;
  position: number;
}>;

/**
 * `content: null` means a persisted tombstone.  Returned revisions omit those
 * rows, but ChangeSets retain them so that deletes take part in conflict checks.
 */
export type CellStateDto = Readonly<{
  cellId: string;
  worksheetId: string;
  row: number;
  column: number;
  content: CellContentDto | null;
  modifiedRevision: number;
}>;

export type WorkbookRevisionDto = Readonly<{
  workbookId: string;
  number: number;
  worksheets: readonly WorksheetDto[];
  cells: readonly CellStateDto[];
}>;

export type WorkbookStateDto = Readonly<{
  workbook: WorkbookDto;
  revision: WorkbookRevisionDto;
}>;

export type WorkbookSeedDto = WorkbookStateDto;

export type WorkbookChangeSetDto = Readonly<{
  workbookId: string;
  baseRevision: number;
  cellChanges: readonly CellStateDto[];
}>;

export type WorkbookRevisionCreateDtoResult =
  | Readonly<{ kind: "created"; state: WorkbookStateDto }>
  | Readonly<{
      kind: "edit-conflict";
      conflictingCellIds: readonly string[];
    }>
  | Readonly<{ kind: "workbook-not-found" }>
  | Readonly<{ kind: "revision-not-found"; requestedRevision: number }>;
