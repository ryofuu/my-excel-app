import type { SpreadsheetClient } from "@/spreadsheet/contracts";
import { createEngineSpreadsheetClient } from "@/spreadsheet/engine-client";

/**
 * Composition root for the browser-facing spreadsheet controller.
 *
 * The UI only receives this contract. The implementation creates input
 * revisions through the repository, then derives a CalculationSnapshot with
 * the isolated spreadsheet engine.
 */
export function createSpreadsheetClient(): SpreadsheetClient {
  return createEngineSpreadsheetClient();
}
