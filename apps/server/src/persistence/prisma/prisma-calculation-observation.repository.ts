import {
  cellIdParts,
  type CalculationSnapshot,
  type CellId,
  type CellValue,
  type WorkbookId,
} from "@gridline/core/domain";
import type { CalculationObservationRepository } from "@gridline/core/usecases";

import { Prisma, type PrismaClient } from "./generated/client";

const graphJson = (snapshot: CalculationSnapshot): string =>
  JSON.stringify({
    precedentsByCell: [...snapshot.graph.precedentsByCell],
    directDependentsByCell: [...snapshot.graph.directDependentsByCell],
    rangeDependents: snapshot.graph.rangeDependents,
  });

const cellValueRow = (
  observationId: string,
  cellId: CellId,
  value: CellValue,
  snapshot: CalculationSnapshot,
): Prisma.CalculationCellValueRecordCreateManyInput => {
  const { worksheetId, address } = cellIdParts(cellId);
  const analysis = snapshot.formulas.get(cellId);
  const base = {
    observationId,
    worksheetId: String(worksheetId),
    rowNumber: Number(address.row),
    columnNumber: Number(address.column),
    numberValue: null,
    textValue: null,
    booleanValue: null,
    errorCode: null,
    errorOriginCellId: null,
    errorMessage: null,
    formulaAnalysisJson:
      analysis === undefined ? null : JSON.stringify(analysis),
  };

  switch (value.kind) {
    case "blank":
      return { ...base, kind: "blank" };
    case "number":
      return { ...base, kind: "number", numberValue: value.value };
    case "text":
      return { ...base, kind: "text", textValue: value.value };
    case "boolean":
      return { ...base, kind: "boolean", booleanValue: value.value };
    case "error":
      return {
        ...base,
        kind: "error",
        errorCode: value.code,
        errorOriginCellId: String(value.origin),
        errorMessage: value.message,
      };
  }
};

/** Snapshotを読み取りモデルへ戻さず、実行ごとの観測行として追記する。 */
export const createPrismaCalculationObservationRepository = (
  client: PrismaClient,
): CalculationObservationRepository => ({
  create: (workbookId: WorkbookId, snapshot: CalculationSnapshot) =>
    client.$transaction(async (transaction) => {
      const observation = await transaction.calculationObservationRecord.create({
        data: {
          workbookId: String(workbookId),
          sourceRevision: Number(snapshot.sourceRevision),
          graphJson: graphJson(snapshot),
          traceJson: JSON.stringify(snapshot.trace),
        },
        select: { id: true },
      });
      const rows = [...snapshot.values].map(([id, value]) =>
        cellValueRow(observation.id, id, value, snapshot),
      );
      if (rows.length > 0) {
        await transaction.calculationCellValueRecord.createMany({ data: rows });
      }
    }),
});
