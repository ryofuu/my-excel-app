import type {
  CellId,
  WorkbookChangeSet,
  WorkbookId,
} from "@gridline/spreadsheet/domain";
import type {
  SpreadsheetRepositories,
  WorkbookRepository,
  WorkbookRevisionCreateResult,
  WorkbookRevisionRepository,
} from "@gridline/spreadsheet/usecases";

import {
  fromWorkbookStateDto,
  toWorkbookChangeSetDto,
  toWorkbookSeedDto,
} from "../sqlite/sqlite-workbook.codec";
import type {
  WorkbookRevisionCreateDtoResult,
  WorkbookStateDto,
} from "../sqlite/sqlite-workbook.dto";

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type HttpSpreadsheetRepositoriesOptions = Readonly<{
  baseUrl?: string;
  fetch?: Fetch;
}>;

const errorMessage = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as Readonly<{
      error?: Readonly<{ message?: string }>;
    }>;
    return body.error?.message ?? `HTTP ${response.status}.`;
  } catch {
    return `HTTP ${response.status}.`;
  }
};

export const createHttpSpreadsheetRepositories = (
  options: HttpSpreadsheetRepositoriesOptions = {},
): SpreadsheetRepositories => {
  const baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
  const fetchRequest = options.fetch ?? globalThis.fetch;

  const request = async (
    path: string,
    init?: RequestInit,
  ): Promise<Response> => {
    const response = await fetchRequest(`${baseUrl}${path}`, init);
    if (!response.ok) {
      throw new Error(await errorMessage(response));
    }
    return response;
  };

  const workbooks: WorkbookRepository = {
    create: async (seed) => {
      const response = await request("/workbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toWorkbookSeedDto(seed)),
      });
      return fromWorkbookStateDto((await response.json()) as WorkbookStateDto);
    },
    find: async (id: WorkbookId) => {
      const response = await fetchRequest(
        `${baseUrl}/workbooks/${encodeURIComponent(String(id))}`,
      );
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(await errorMessage(response));
      return fromWorkbookStateDto((await response.json()) as WorkbookStateDto);
    },
    delete: async (id: WorkbookId) => {
      await request(`/workbooks/${encodeURIComponent(String(id))}`, {
        method: "DELETE",
      });
    },
  };

  const revisions: WorkbookRevisionRepository = {
    create: async (
      changeSet: WorkbookChangeSet,
    ): Promise<WorkbookRevisionCreateResult> => {
      const response = await request("/workbook-revisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toWorkbookChangeSetDto(changeSet)),
      });
      const result = (await response.json()) as WorkbookRevisionCreateDtoResult;
      switch (result.kind) {
        case "created":
          return { kind: "created", state: fromWorkbookStateDto(result.state) };
        case "edit-conflict":
          return {
            kind: "edit-conflict",
            conflictingCellIds: result.conflictingCellIds as readonly CellId[],
          };
        case "workbook-not-found":
        case "revision-not-found":
          return result;
      }
    },
  };

  return { workbooks, revisions };
};
