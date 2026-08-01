import type {
  CellId,
  WorkbookChangeSet,
  WorkbookId,
} from "@gridline/spreadsheet/domain";
import type {
  WorkbookSeed,
  WorkbookState,
} from "../workbooks/workbook-state.type";

export type WorkbookRevisionCreateResult =
  | Readonly<{
      kind: "created";
      state: WorkbookState;
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
  create(seed: WorkbookSeed): Promise<WorkbookState>;
  find(id: WorkbookId): Promise<WorkbookState | null>;
  delete(id: WorkbookId): Promise<void>;
}

/**
 * Persists a ChangeSet atomically.  Its implementation owns optimistic
 * conflict detection, including tombstones for deleted cells.
 */
export interface WorkbookRevisionRepository {
  create(changeSet: WorkbookChangeSet): Promise<WorkbookRevisionCreateResult>;
}

export type SpreadsheetRepositories = Readonly<{
  workbooks: WorkbookRepository;
  revisions: WorkbookRevisionRepository;
}>;
