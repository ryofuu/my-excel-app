import type {
  CellId,
  Workbook,
  WorkbookChangeSet,
  WorkbookId,
  WorkbookRevision,
} from "@gridline/spreadsheet/domain";

/**
 * A workbook and its first input revision are created together.  A workbook
 * without a revision would not have the required initial worksheet state.
 */
export type WorkbookSeed = Readonly<{
  workbook: Workbook;
  revision: WorkbookRevision;
}>;

export type WorkbookRevisionCreateResult =
  | Readonly<{
      kind: "created";
      revision: WorkbookRevision;
    }>
  | Readonly<{
      kind: "edit-conflict";
      conflictingCellIds: readonly CellId[];
    }>
  | Readonly<{
      kind: "workbook-not-found";
    }>
  | Readonly<{
      kind: "revision-not-found";
      requestedRevision: number;
    }>;

/** Persists the workbook identity and the initial, complete input state. */
export interface WorkbookRepository {
  create(seed: WorkbookSeed): Promise<Workbook>;
  find(id: WorkbookId): Promise<Workbook | null>;
  delete(id: WorkbookId): Promise<void>;
}

/**
 * Persists a ChangeSet atomically.  Its implementation owns optimistic
 * conflict detection, including tombstones for deleted cells.
 */
export interface WorkbookRevisionRepository {
  create(changeSet: WorkbookChangeSet): Promise<WorkbookRevisionCreateResult>;
  find(
    workbookId: WorkbookId,
    revision: number,
  ): Promise<WorkbookRevision | null>;
}

export type SpreadsheetRepositories = Readonly<{
  workbooks: WorkbookRepository;
  revisions: WorkbookRevisionRepository;
}>;
