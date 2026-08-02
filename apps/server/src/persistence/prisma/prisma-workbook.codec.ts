import * as z from "zod";

import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  booleanLiteral,
  cellAddress,
  cellId,
  formulaContent,
  formulaSource,
  literalContent,
  numberLiteral,
  revisionNumber,
  textLiteral,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
  type CellContent,
  type CellId,
} from "@gridline/core/domain";

import type { Prisma } from "./generated/client";

export const workbookRecordInclude = {
  worksheets: {
    orderBy: { position: "asc" },
    include: {
      cells: {
        orderBy: [
          { rowNumber: "asc" },
          { columnNumber: "asc" },
        ],
      },
    },
  },
} as const satisfies Prisma.WorkbookRecordInclude;

export type CompleteWorkbookRecord = Prisma.WorkbookRecordGetPayload<{
  include: typeof workbookRecordInclude;
}>;

const cellContentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("literal"),
    literal: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("number"), value: z.number().finite() }),
      z.object({ kind: z.literal("text"), value: z.string() }),
      z.object({ kind: z.literal("boolean"), value: z.boolean() }),
    ]),
  }),
  z.object({ kind: z.literal("formula"), source: z.string() }),
]);

const cellContent = (
  value: z.infer<typeof cellContentSchema>,
): CellContent => {
  if (value.kind === "formula") {
    return formulaContent(formulaSource(value.source));
  }
  switch (value.literal.kind) {
    case "number":
      return literalContent(numberLiteral(value.literal.value));
    case "text":
      return literalContent(textLiteral(value.literal.value));
    case "boolean":
      return literalContent(booleanLiteral(value.literal.value));
  }
};

export const contentFromJson = (value: string | null): CellContent | null =>
  value === null
    ? null
    // JSON の形は Zod、業務上の制約は各 VO Factory の二段階で検証する。
    : cellContent(cellContentSchema.parse(JSON.parse(value)));

export const contentJson = (content: CellContent | null): string | null =>
  content === null ? null : JSON.stringify(content);

export const workbookFromRecord = (
  record: CompleteWorkbookRecord,
): Workbook => {
  // Prisma Record を Domain の Factory / Entity に通して再構築し、DBの値を無条件には信用しない。
  const cells = new Map<CellId, Cell>();
  for (const worksheetRecord of record.worksheets) {
    const sheetId = worksheetId(worksheetRecord.id);
    for (const cellRecord of worksheetRecord.cells) {
      const id = cellId(
        sheetId,
        cellAddress(cellRecord.rowNumber, cellRecord.columnNumber),
      );
      cells.set(
        id,
        new Cell({
          id,
          content: contentFromJson(cellRecord.contentJson),
          modifiedRevision: revisionNumber(cellRecord.modifiedRevision),
        }),
      );
    }
  }

  // 永続化用 Record は Domain Model ではない。最終的な整合性は Aggregate の生成時に検証する。
  return new Workbook({
    id: workbookId(record.id),
    name: workbookName(record.name),
    revision: new WorkbookRevision({
      number: revisionNumber(record.currentRevision),
      worksheets: record.worksheets.map(
        (worksheet) =>
          new Worksheet({
            id: worksheetId(worksheet.id),
            name: worksheetName(worksheet.name),
          }),
      ),
      cells,
    }),
  });
};
