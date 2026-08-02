import * as z from "zod";

import type { CalculationSnapshot, CellValue } from "@gridline/core/domain";

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

export const calculationObservationRequestSchema = z.object({
  sourceRevision: z.number().int().nonnegative(),
});

export const calculationSnapshotResourceSchema = z.object({
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

export type CalculationSnapshotResource = z.infer<
  typeof calculationSnapshotResourceSchema
>;

const cellValueResource = (
  value: CellValue,
): z.infer<typeof cellValueResourceSchema> =>
  value.kind === "error"
    ? { ...value, origin: String(value.origin) }
    : value;

/** Serverで生成したSnapshotのうち、Webが表示に必要な結果とTraceだけを返す。 */
export const calculationSnapshotResource = (
  snapshot: CalculationSnapshot,
): CalculationSnapshotResource => ({
  sourceRevision: Number(snapshot.sourceRevision),
  values: [...snapshot.values].map(([cellId, value]) => ({
    cellId: String(cellId),
    value: cellValueResource(value),
  })),
  trace: {
    dirtyCellIds: snapshot.trace.dirtyCellIds.map(String),
    evaluationOrder: snapshot.trace.evaluationOrder.map(String),
    cycles: snapshot.trace.cycles.map((cycle) => cycle.map(String)),
  },
});
