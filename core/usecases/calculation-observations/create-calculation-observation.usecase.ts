import {
  recalculate,
  type CalculationSnapshot,
  type RevisionNumber,
  type WorkbookId,
} from "@gridline/core/domain";

import type { CalculationObservationRepositories } from "../ports/calculation-observation-repository.port";

export type CalculationObservationCreateInput = Readonly<{
  workbookId: WorkbookId;
  sourceRevision: RevisionNumber;
}>;

export type CalculationObservationCreateResult =
  | Readonly<{ kind: "created"; snapshot: CalculationSnapshot }>
  | Readonly<{ kind: "workbook-not-found" }>
  | Readonly<{
      kind: "revision-not-found";
      requestedRevision: RevisionNumber;
    }>;

/** 現在のWorkbookRevisionからSnapshotを生成し、同じ実行結果を観測記録へ追記する。 */
export const createCalculationObservation = async (
  repositories: CalculationObservationRepositories,
  input: CalculationObservationCreateInput,
): Promise<CalculationObservationCreateResult> => {
  const workbook = await repositories.workbooks.find(input.workbookId);
  if (workbook === null) {
    return { kind: "workbook-not-found" };
  }
  if (workbook.revision.number !== input.sourceRevision) {
    return {
      kind: "revision-not-found",
      requestedRevision: input.sourceRevision,
    };
  }

  // DB上の観測結果は再利用せず、要求されたRevisionから毎回新しく計算する。
  const snapshot = recalculate(workbook);
  await repositories.calculationObservations.create(workbook.id, snapshot);
  return { kind: "created", snapshot };
};
