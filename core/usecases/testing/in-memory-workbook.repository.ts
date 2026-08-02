import type { Workbook, WorkbookId } from "@gridline/core/domain";

import type {
  SpreadsheetRepositories,
  WorkbookRepository,
} from "../ports/spreadsheet-repositories.port";

/** Integration Test 用のインメモリ永続化。Domain の業務規則は持たない。 */
export const createInMemoryRepositories = (): SpreadsheetRepositories => {
  const workbooks = new Map<WorkbookId, Workbook>();

  const repository: WorkbookRepository = {
    create: async (workbook) => {
      if (workbooks.has(workbook.id)) {
        return { kind: "already-exists" };
      }
      workbooks.set(workbook.id, workbook);
      return { kind: "created" };
    },

    find: async (id) => workbooks.get(id) ?? null,

    update: async (workbook, expectedRevision) => {
      const current = workbooks.get(workbook.id);
      if (current === undefined) {
        return { kind: "workbook-not-found" };
      }
      if (current.revision.number !== expectedRevision) {
        return { kind: "concurrent-write" };
      }
      workbooks.set(workbook.id, workbook);
      return { kind: "updated" };
    },

    delete: async (id) => {
      workbooks.delete(id);
    },
  };

  return { workbooks: repository };
};
