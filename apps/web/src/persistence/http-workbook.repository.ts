import type { WorkbookId } from "@gridline/core/domain";
import type {
  SpreadsheetRepositories,
  WorkbookRepository,
} from "@gridline/core/usecases";
import * as z from "zod";

import { workbookFromResource, workbookResource } from "./workbook.resource";

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type HttpWorkbookRepositoryOptions = Readonly<{
  baseUrl?: string;
  fetch?: Fetch;
}>;

const errorResourceSchema = z.object({
  error: z.object({ message: z.string() }),
});

const errorMessage = async (response: Response): Promise<string> => {
  try {
    const result = errorResourceSchema.safeParse(await response.json());
    if (result.success) return result.data.error.message;
  } catch {
    // Error Resource が不正な場合は、HTTP Status を使った汎用 Message に切り替える。
  }
  return `HTTP ${response.status}.`;
};

export const createHttpSpreadsheetRepositories = (
  options: HttpWorkbookRepositoryOptions = {},
): SpreadsheetRepositories => {
  const baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
  const fetchRequest = options.fetch ?? globalThis.fetch;

  const repository: WorkbookRepository = {
    create: async (workbook) => {
      const response = await fetchRequest(`${baseUrl}/workbooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(workbookResource(workbook)),
      });
      if (response.status === 409) {
        return { kind: "already-exists" };
      }
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      workbookFromResource(await response.json());
      return { kind: "created" };
    },

    find: async (id: WorkbookId) => {
      const response = await fetchRequest(
        `${baseUrl}/workbooks/${encodeURIComponent(String(id))}`,
      );
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return workbookFromResource(await response.json());
    },

    update: async (workbook, expectedRevision) => {
      const response = await fetchRequest(
        `${baseUrl}/workbooks/${encodeURIComponent(String(workbook.id))}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workbook: workbookResource(workbook),
            expectedRevision: Number(expectedRevision),
          }),
        },
      );
      if (response.status === 404) {
        return { kind: "workbook-not-found" };
      }
      if (response.status === 409) {
        return { kind: "concurrent-write" };
      }
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return { kind: "updated" };
    },

    delete: async (id) => {
      const response = await fetchRequest(
        `${baseUrl}/workbooks/${encodeURIComponent(String(id))}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
    },
  };

  return { workbooks: repository };
};
