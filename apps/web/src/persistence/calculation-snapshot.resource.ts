import {
  BLANK,
  booleanLiteral,
  calculationSnapshot,
  calculationTrace,
  compileRevision,
  errorValue,
  literalValue,
  numberLiteral,
  parseCellId,
  revisionNumber,
  textLiteral,
  type CalculationSnapshot,
  type CellId,
  type CellValue,
  type Workbook,
} from "@gridline/core/domain";
import * as z from "zod";

const cellValueResourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blank") }),
  z.object({ kind: z.literal("number"), value: z.number().finite() }),
  z.object({ kind: z.literal("text"), value: z.string() }),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }),
  z.object({
    kind: z.literal("error"),
    code: z.enum([
      "parse",
      "type",
      "division-by-zero",
      "invalid-reference",
      "circular-reference",
      "unknown-function",
    ]),
    origin: z.string(),
    message: z.string(),
  }),
]);

const calculationSnapshotResourceSchema = z.object({
  sourceRevision: z.number().int().nonnegative(),
  values: z.array(
    z.object({ cellId: z.string(), value: cellValueResourceSchema }),
  ),
  trace: z.object({
    dirtyCellIds: z.array(z.string()),
    evaluationOrder: z.array(z.string()),
    cycles: z.array(z.array(z.string())),
  }),
});

const cellValueFromResource = (
  resource: z.infer<typeof cellValueResourceSchema>,
): CellValue => {
  switch (resource.kind) {
    case "blank":
      return BLANK;
    case "number":
      return literalValue(numberLiteral(resource.value));
    case "text":
      return literalValue(textLiteral(resource.value));
    case "boolean":
      return literalValue(booleanLiteral(resource.value));
    case "error":
      return errorValue(
        resource.code,
        parseCellId(resource.origin),
        resource.message,
      );
  }
};

const traceIds = (values: readonly string[]): readonly CellId[] =>
  values.map(parseCellId);

/** HTTP Resourceを検証し、表示に必要な解析Metadataと組み合わせてSnapshotへ戻す。 */
export const calculationSnapshotFromResource = (
  input: unknown,
  workbook: Workbook,
): CalculationSnapshot => {
  const resource = calculationSnapshotResourceSchema.parse(input);
  const sourceRevision = revisionNumber(resource.sourceRevision);
  if (sourceRevision !== workbook.revision.number) {
    throw new Error("CalculationSnapshot belongs to a different WorkbookRevision.");
  }

  const values = new Map<CellId, CellValue>();
  for (const entry of resource.values) {
    const id = parseCellId(entry.cellId);
    if (values.has(id)) {
      throw new Error(`CalculationSnapshot contains duplicate CellId: ${id}`);
    }
    const cell = workbook.revision.cells.get(id);
    if (cell === undefined || cell.content === null) {
      throw new Error(`CalculationSnapshot contains a value for an absent Cell: ${id}`);
    }
    values.set(id, cellValueFromResource(entry.value));
  }
  for (const cell of workbook.revision.cells.values()) {
    if (cell.content !== null && !values.has(cell.id)) {
      throw new Error(`CalculationSnapshot is missing CellValue: ${cell.id}`);
    }
  }

  // Formula解析は同じWorkbookRevisionから決定的に再構築し、HTTP Payloadを小さく保つ。
  const compiled = compileRevision(workbook.revision);
  return calculationSnapshot({
    sourceRevision,
    values,
    formulas: compiled.formulas,
    graph: compiled.graph,
    trace: calculationTrace({
      dirtyCellIds: traceIds(resource.trace.dirtyCellIds),
      evaluationOrder: traceIds(resource.trace.evaluationOrder),
      cycles: resource.trace.cycles.map(traceIds),
    }),
  });
};
