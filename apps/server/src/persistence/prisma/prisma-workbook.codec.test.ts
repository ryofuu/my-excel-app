import { describe, expect, it } from "vitest";

import { formulaContent, formulaSource } from "@gridline/core/domain";

import {
  contentJson,
  workbookFromRecord,
  type CompleteWorkbookRecord,
} from "./prisma-workbook.codec";

const record = (
  contentJsonValue: string | null,
): CompleteWorkbookRecord => ({
  id: "workbook-1",
  name: "Budget",
  currentRevision: 3,
  worksheets: [
    {
      workbookId: "workbook-1",
      id: "worksheet-1",
      name: "Sheet1",
      position: 0,
      cells: [
        {
          workbookId: "workbook-1",
          worksheetId: "worksheet-1",
          rowNumber: 2,
          columnNumber: 3,
          contentJson: contentJsonValue,
          modifiedRevision: 3,
        },
      ],
    },
  ],
});

describe("Prisma Workbook codec", () => {
  it("Prisma recordからWorkbook集約をDomain factory経由で復元する", () => {
    const workbook = workbookFromRecord(
      record(JSON.stringify({ kind: "formula", source: "=A1+1" })),
    );

    expect(workbook).toMatchObject({
      id: "workbook-1",
      name: "Budget",
      revision: { number: 3 },
    });
    expect([...workbook.revision.cells.values()][0]).toMatchObject({
      id: "worksheet-1!C2",
      content: { kind: "formula", source: "=A1+1" },
      modifiedRevision: 3,
    });
  });

  it("削除済みCellのnull contentを復元する", () => {
    const workbook = workbookFromRecord(record(null));

    expect([...workbook.revision.cells.values()][0]?.content).toBeNull();
    expect(contentJson(null)).toBeNull();
  });

  it("不完全なcontent JSONをZodとDomain factoryで拒否する", () => {
    expect(() =>
      workbookFromRecord(
        record(JSON.stringify({ kind: "formula", source: "A1+1" })),
      ),
    ).toThrow("FormulaSource must start with '='.");
  });

  it("検証済みCellContentだけをJSONへ変換する", () => {
    expect(contentJson(formulaContent(formulaSource("=1+1")))).toBe(
      JSON.stringify({ kind: "formula", source: "=1+1" }),
    );
  });
});
