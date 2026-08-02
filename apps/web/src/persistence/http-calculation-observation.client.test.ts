import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellId,
  dependentsOf,
  parseA1Address,
  parseCellInput,
  revisionNumber,
  valueInSnapshot,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
} from "@gridline/core/domain";
import { describe, expect, it } from "vitest";

import { createHttpCalculationObservationClient } from "./http-calculation-observation.client";

const createTestWorkbook = (): Workbook => {
  const worksheetIdentifier = worksheetId("worksheet-1");
  const revision = revisionNumber(0);
  const a1 = cellId(worksheetIdentifier, parseA1Address("A1"));
  const b1 = cellId(worksheetIdentifier, parseA1Address("B1"));
  return new Workbook({
    id: workbookId("workbook-1"),
    name: workbookName("HTTP calculation"),
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

describe("HTTP CalculationObservationClient", () => {
  it("Server生成値を検証しWorkbookRevision由来の解析情報と組み合わせる", async () => {
    const workbook = createTestWorkbook();
    const requests: Request[] = [];
    const client = createHttpCalculationObservationClient({
      baseUrl: "http://gridline.test/api",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response(
          JSON.stringify({
            sourceRevision: 0,
            values: [
              {
                cellId: "worksheet-1!A1",
                value: { kind: "number", value: 2 },
              },
              {
                cellId: "worksheet-1!B1",
                value: { kind: "number", value: 3 },
              },
            ],
            trace: {
              dirtyCellIds: ["worksheet-1!A1", "worksheet-1!B1"],
              evaluationOrder: ["worksheet-1!B1"],
              cycles: [],
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    const snapshot = await client.create(workbook);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "http://gridline.test/api/workbooks/workbook-1/calculation-observations",
    );
    expect(requests[0]?.method).toBe("POST");
    await expect(requests[0]?.json()).resolves.toEqual({ sourceRevision: 0 });
    const a1 = cellId(worksheetId("worksheet-1"), parseA1Address("A1"));
    const b1 = cellId(worksheetId("worksheet-1"), parseA1Address("B1"));
    expect(valueInSnapshot(snapshot, b1)).toEqual({
      kind: "number",
      value: 3,
    });
    expect(snapshot.formulas.get(b1)?.parse.kind).toBe("success");
    expect(dependentsOf(snapshot.graph, a1)).toEqual([b1]);
  });

  it("CellValueが欠けた不完全なSnapshot Resourceを受け入れない", async () => {
    const workbook = createTestWorkbook();
    const client = createHttpCalculationObservationClient({
      baseUrl: "http://gridline.test/api",
      fetch: async () =>
        new Response(
          JSON.stringify({
            sourceRevision: 0,
            values: [
              {
                cellId: "worksheet-1!A1",
                value: { kind: "number", value: 2 },
              },
            ],
            trace: {
              dirtyCellIds: ["worksheet-1!A1", "worksheet-1!B1"],
              evaluationOrder: ["worksheet-1!B1"],
              cycles: [],
            },
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
    });

    await expect(client.create(workbook)).rejects.toThrow(
      "CalculationSnapshot is missing CellValue: worksheet-1!B1",
    );
  });
});
