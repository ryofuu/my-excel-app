import type {
  SpreadsheetRepositories,
  WorkbookRepository,
  WorkbookRevisionCreateResult,
  WorkbookRevisionRepository,
} from "@gridline/usecases";
import type {
  Workbook,
  WorkbookChangeSet,
  CellId,
  WorkbookId,
  WorkbookRevision,
} from "@gridline/domain";

import {
  fromWorkbookDto,
  fromWorkbookRevisionDto,
  toWorkbookChangeSetDto,
  toWorkbookSeedDto,
} from "./entity-codec";
import type { RepositoryWorkerClient } from "./worker/worker-client";

const unexpectedResult = (expected: string, actual: string): never => {
  throw new Error(`Expected ${expected} from SQLite worker, received ${actual}.`);
};

export type SqliteWorkbookRepositories = SpreadsheetRepositories &
  Readonly<{
    dispose: () => void;
  }>;

/**
 * Builds application ports around a single Worker client. All conversion to
 * and from Entity instances happens here, outside the structured-clone boundary.
 */
export const createSqliteWorkbookRepositories = (
  client: RepositoryWorkerClient,
): SqliteWorkbookRepositories => {
  const workbooks: WorkbookRepository = {
    create: async (seed) => {
      const result = await client.execute({
        kind: "workbook.create",
        seed: toWorkbookSeedDto(seed),
      });
      if (result.kind !== "workbook.created") {
        return unexpectedResult("workbook.created", result.kind);
      }
      return fromWorkbookDto(result.workbook);
    },
    find: async (id: WorkbookId): Promise<Workbook | null> => {
      const result = await client.execute({
        kind: "workbook.find",
        workbookId: String(id),
      });
      if (result.kind !== "workbook.found") {
        return unexpectedResult("workbook.found", result.kind);
      }
      return result.workbook ? fromWorkbookDto(result.workbook) : null;
    },
    delete: async (id: WorkbookId): Promise<void> => {
      const result = await client.execute({
        kind: "workbook.delete",
        workbookId: String(id),
      });
      if (result.kind !== "workbook.deleted") {
        unexpectedResult("workbook.deleted", result.kind);
      }
    },
  };

  const revisions: WorkbookRevisionRepository = {
    create: async (
      changeSet: WorkbookChangeSet,
    ): Promise<WorkbookRevisionCreateResult> => {
      const result = await client.execute({
        kind: "revision.create",
        changeSet: toWorkbookChangeSetDto(changeSet),
      });
      if (result.kind !== "revision.created") {
        return unexpectedResult("revision.created", result.kind);
      }
      switch (result.result.kind) {
        case "created":
          return {
            kind: "created",
            revision: fromWorkbookRevisionDto(result.result.revision),
          };
        case "edit-conflict":
          return {
            kind: "edit-conflict",
            conflictingCellIds: result.result.conflictingCellIds as readonly CellId[],
          };
        case "workbook-not-found":
          return result.result;
        case "revision-not-found":
          return result.result;
      }
    },
    find: async (
      id: WorkbookId,
      revision: number,
    ): Promise<WorkbookRevision | null> => {
      const result = await client.execute({
        kind: "revision.find",
        workbookId: String(id),
        revision,
      });
      if (result.kind !== "revision.found") {
        return unexpectedResult("revision.found", result.kind);
      }
      return result.revision ? fromWorkbookRevisionDto(result.revision) : null;
    },
  };

  return {
    workbooks,
    revisions,
    dispose: client.dispose,
  };
};
