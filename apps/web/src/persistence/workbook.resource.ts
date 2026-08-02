import * as z from "zod";

import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  booleanLiteral,
  formulaContent,
  formulaSource,
  literalContent,
  numberLiteral,
  parseCellId,
  revisionNumber,
  textLiteral,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
  type CellContent,
  type CellId,
} from "@gridline/core/domain";

const cellContentResourceSchema = z.discriminatedUnion("kind", [
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

export const workbookResourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  revision: z.object({
    number: z.number().int().nonnegative(),
    worksheets: z.array(z.object({ id: z.string(), name: z.string() })),
    cells: z.array(
      z.object({
        id: z.string(),
        content: cellContentResourceSchema.nullable(),
        modifiedRevision: z.number().int().nonnegative(),
      }),
    ),
  }),
});

export type WorkbookResource = z.infer<typeof workbookResourceSchema>;

const decodeCellContent = (
  resource: z.infer<typeof cellContentResourceSchema>,
): CellContent => {
  if (resource.kind === "formula") {
    return formulaContent(formulaSource(resource.source));
  }
  switch (resource.literal.kind) {
    case "number":
      return literalContent(numberLiteral(resource.literal.value));
    case "text":
      return literalContent(textLiteral(resource.literal.value));
    case "boolean":
      return literalContent(booleanLiteral(resource.literal.value));
  }
};

export const workbookFromResource = (input: unknown): Workbook => {
  const resource = workbookResourceSchema.parse(input);
  const cells = new Map<CellId, Cell>();
  for (const cellResource of resource.revision.cells) {
    const id = parseCellId(cellResource.id);
    if (cells.has(id)) {
      throw new Error(`WorkbookResource contains duplicate CellId: ${id}`);
    }
    cells.set(
      id,
      new Cell({
        id,
        content:
          cellResource.content === null
            ? null
            : decodeCellContent(cellResource.content),
        modifiedRevision: revisionNumber(cellResource.modifiedRevision),
      }),
    );
  }

  return new Workbook({
    id: workbookId(resource.id),
    name: workbookName(resource.name),
    revision: new WorkbookRevision({
      number: revisionNumber(resource.revision.number),
      worksheets: resource.revision.worksheets.map(
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

export const workbookResource = (workbook: Workbook): WorkbookResource => ({
  id: String(workbook.id),
  name: String(workbook.name),
  revision: {
    number: Number(workbook.revision.number),
    worksheets: workbook.revision.worksheets.map((worksheet) => ({
      id: String(worksheet.id),
      name: String(worksheet.name),
    })),
    cells: [...workbook.revision.cells.values()].map((cell) => ({
      id: String(cell.id),
      content: cell.content,
      modifiedRevision: Number(cell.modifiedRevision),
    })),
  },
});
