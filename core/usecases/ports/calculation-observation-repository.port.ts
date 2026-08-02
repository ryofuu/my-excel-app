import type {
  CalculationSnapshot,
  WorkbookId,
} from "@gridline/core/domain";

import type { WorkbookRepository } from "./spreadsheet-repositories.port";

/** CalculationSnapshotを業務判断へ戻さず、観測記録として追記する出口。 */
export interface CalculationObservationRepository {
  create(
    workbookId: WorkbookId,
    snapshot: CalculationSnapshot,
  ): Promise<void>;
}

export type CalculationObservationRepositories = Readonly<{
  workbooks: WorkbookRepository;
  calculationObservations: CalculationObservationRepository;
}>;
