import { describe, expect, it } from "vitest";

import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellId,
  parseA1Address,
  parseCellInput,
  revisionNumber,
  valueInSnapshot,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
  type CalculationSnapshot,
} from "@gridline/core/domain";
import {
  createCalculationObservation,
  createWorkbook,
  type CalculationObservationRepository,
} from "@gridline/core/usecases";
import { createInMemoryRepositories } from "@gridline/core/testing";

const createTestWorkbook = (): Workbook => {
  const workbookIdentifier = workbookId("workbook-1");
  const worksheetIdentifier = worksheetId("worksheet-1");
  const revision = revisionNumber(0);
  const a1 = cellId(worksheetIdentifier, parseA1Address("A1"));
  const b1 = cellId(worksheetIdentifier, parseA1Address("B1"));

  return new Workbook({
    id: workbookIdentifier,
    name: workbookName("Calculation observation"),
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

describe("CalculationObservationの作成", () => {
  it("指定したWorkbookRevisionをServerで再計算して観測記録へ追加する", async () => {
    const repositories = createInMemoryRepositories();
    const workbook = createTestWorkbook();
    await createWorkbook(repositories, workbook);
    const observed: Array<
      Readonly<{
        workbookId: typeof workbook.id;
        snapshot: CalculationSnapshot;
      }>
    > = [];
    const observations: CalculationObservationRepository = {
      create: async (workbookIdValue, snapshot) => {
        observed.push({ workbookId: workbookIdValue, snapshot });
      },
    };

    const result = await createCalculationObservation(
      { workbooks: repositories.workbooks, calculationObservations: observations },
      {
        workbookId: workbook.id,
        sourceRevision: workbook.revision.number,
      },
    );

    expect(result.kind).toBe("created");
    if (result.kind !== "created") return;
    const formulaCellId = cellId(
      worksheetId("worksheet-1"),
      parseA1Address("B1"),
    );
    expect(valueInSnapshot(result.snapshot, formulaCellId)).toEqual({
      kind: "number",
      value: 3,
    });
    expect(observed).toEqual([
      { workbookId: workbook.id, snapshot: result.snapshot },
    ]);
  });

  it("存在しないWorkbookを観測記録へ追加しない", async () => {
    const repositories = createInMemoryRepositories();
    let observed = false;
    const observations: CalculationObservationRepository = {
      create: async () => {
        observed = true;
      },
    };

    const result = await createCalculationObservation(
      { workbooks: repositories.workbooks, calculationObservations: observations },
      {
        workbookId: workbookId("missing-workbook"),
        sourceRevision: revisionNumber(0),
      },
    );

    expect(result).toEqual({ kind: "workbook-not-found" });
    expect(observed).toBe(false);
  });

  it("現在と異なるWorkbookRevisionを観測対象にしない", async () => {
    const repositories = createInMemoryRepositories();
    const workbook = createTestWorkbook();
    await createWorkbook(repositories, workbook);
    let observed = false;
    const observations: CalculationObservationRepository = {
      create: async () => {
        observed = true;
      },
    };

    const result = await createCalculationObservation(
      { workbooks: repositories.workbooks, calculationObservations: observations },
      {
        workbookId: workbook.id,
        sourceRevision: revisionNumber(1),
      },
    );

    expect(result).toEqual({
      kind: "revision-not-found",
      requestedRevision: 1,
    });
    expect(observed).toBe(false);
  });
});
