import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellId,
  parseA1Address,
  parseCellInput,
  recalculate,
  revisionNumber,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
} from "@gridline/core/domain";
import { afterEach, describe, expect, it } from "vitest";

import { createPrismaDatabase } from "./prisma-client.factory";
import { createPrismaCalculationObservationRepository } from "./prisma-calculation-observation.repository";
import { initializePrismaSchema } from "./prisma-schema.initializer";
import { createPrismaWorkbookRepository } from "./prisma-workbook.repository";

const temporaryDirectories: string[] = [];

const createTestWorkbook = (): Workbook => {
  const workbookIdentifier = workbookId("observed-workbook");
  const worksheetIdentifier = worksheetId("observed-worksheet");
  const revision = revisionNumber(0);
  const a1 = cellId(worksheetIdentifier, parseA1Address("A1"));
  const b1 = cellId(worksheetIdentifier, parseA1Address("B1"));

  return new Workbook({
    id: workbookIdentifier,
    name: workbookName("Observed workbook"),
    revision: new WorkbookRevision({
      number: revision,
      worksheets: [
        new Worksheet({
          id: worksheetIdentifier,
          name: worksheetName("Sheet1"),
        }),
      ],
      cells: new Map([
        [
          a1,
          new Cell({
            id: a1,
            content: parseCellInput("2"),
            modifiedRevision: revision,
          }),
        ],
        [
          b1,
          new Cell({
            id: b1,
            content: parseCellInput("=A1+1"),
            modifiedRevision: revision,
          }),
        ],
      ]),
    }),
  });
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("Prisma CalculationObservationRepository", () => {
  it("同じWorkbookRevisionの生成結果も実行ごとの観測記録として追記する", async () => {
    const directory = await mkdtemp(join(tmpdir(), "gridline-observation-"));
    temporaryDirectories.push(directory);
    const database = createPrismaDatabase(join(directory, "gridline.sqlite3"));
    try {
      await initializePrismaSchema(database.client);
      const workbook = createTestWorkbook();
      await createPrismaWorkbookRepository(database.client).create(workbook);
      const observations = createPrismaCalculationObservationRepository(
        database.client,
      );
      const snapshot = recalculate(workbook);

      await observations.create(workbook.id, snapshot);
      await observations.create(workbook.id, snapshot);

      await expect(
        database.client.calculationObservationRecord.count(),
      ).resolves.toBe(2);
      const values = await database.client.calculationCellValueRecord.findMany({
        orderBy: [
          { worksheetId: "asc" },
          { rowNumber: "asc" },
          { columnNumber: "asc" },
        ],
      });
      expect(values).toHaveLength(4);
      expect(values.filter((value) => value.columnNumber === 1)).toEqual([
        expect.objectContaining({
          kind: "number",
          numberValue: 2,
          formulaAnalysisJson: null,
        }),
        expect.objectContaining({
          kind: "number",
          numberValue: 2,
          formulaAnalysisJson: null,
        }),
      ]);
      const formulaValues = values.filter((value) => value.columnNumber === 2);
      expect(formulaValues).toHaveLength(2);
      for (const value of formulaValues) {
        expect(value).toMatchObject({ kind: "number", numberValue: 3 });
        expect(JSON.parse(value.formulaAnalysisJson ?? "null")).toMatchObject({
          source: "=A1+1",
          parse: { kind: "success", ast: { kind: "binary" } },
        });
      }
    } finally {
      await database.close();
    }
  });
});
