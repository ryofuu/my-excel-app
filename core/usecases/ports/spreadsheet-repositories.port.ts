import type {
  RevisionNumber,
  Workbook,
  WorkbookId,
} from "@gridline/core/domain";

export type WorkbookCreateResult =
  | Readonly<{ kind: "created" }>
  | Readonly<{ kind: "already-exists" }>;

export type WorkbookUpdateResult =
  | Readonly<{ kind: "updated" }>
  | Readonly<{ kind: "concurrent-write" }>
  | Readonly<{ kind: "workbook-not-found" }>;

/** Workbook の識別子と、完全な入力状態を Aggregate 単位で永続化する。 */
export interface WorkbookRepository {
  create(workbook: Workbook): Promise<WorkbookCreateResult>;
  find(id: WorkbookId): Promise<Workbook | null>;
  update(
    workbook: Workbook,
    expectedRevision: RevisionNumber,
  ): Promise<WorkbookUpdateResult>;
  delete(id: WorkbookId): Promise<void>;
}

export type SpreadsheetRepositories = Readonly<{
  workbooks: WorkbookRepository;
}>;
