import type { CalculationSnapshot, Workbook } from "@gridline/core/domain";
import * as z from "zod";

import { calculationSnapshotFromResource } from "./calculation-snapshot.resource";

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type HttpCalculationObservationClientOptions = Readonly<{
  baseUrl?: string;
  fetch?: Fetch;
}>;

export interface CalculationObservationClient {
  create(workbook: Workbook): Promise<CalculationSnapshot>;
}

const errorResourceSchema = z.object({
  error: z.object({ message: z.string() }),
});

const errorMessage = async (response: Response): Promise<string> => {
  try {
    const result = errorResourceSchema.safeParse(await response.json());
    if (result.success) return result.data.error.message;
  } catch {
    // Error Resource が不正な場合は、HTTP Status を使った汎用Messageに切り替える。
  }
  return `HTTP ${response.status}.`;
};

/** ServerへRecalculationを要求し、生成直後のSnapshotだけを受け取る。 */
export const createHttpCalculationObservationClient = (
  options: HttpCalculationObservationClientOptions = {},
): CalculationObservationClient => {
  const baseUrl = (options.baseUrl ?? "/api").replace(/\/$/, "");
  const fetchRequest = options.fetch ?? globalThis.fetch;

  return {
    create: async (workbook) => {
      const response = await fetchRequest(
        `${baseUrl}/workbooks/${encodeURIComponent(String(workbook.id))}/calculation-observations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceRevision: Number(workbook.revision.number),
          }),
        },
      );
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return calculationSnapshotFromResource(await response.json(), workbook);
    },
  };
};
