import { columnLabel, type CellAddress } from "../cell-address.vo";
import type { Literal } from "../cell-content.vo";

/**
 * The text-level reference kept in a Formula. The address is the target in the
 * formula's current location; absolute flags matter when the Formula is copied.
 */
export type CellReference = Readonly<{
  address: CellAddress;
  columnAbsolute: boolean;
  rowAbsolute: boolean;
}>;

export type RangeReference = Readonly<{
  start: CellReference;
  end: CellReference;
}>;

export type UnaryOperator = "+" | "-";
export type BinaryOperator = "+" | "-" | "*" | "/" | "&" | "=" | "<>" | "<" | "<=" | ">" | ">=";

export type Expression =
  | Readonly<{ kind: "literal"; literal: Literal }>
  | Readonly<{ kind: "reference"; reference: CellReference }>
  | Readonly<{ kind: "range"; range: RangeReference }>
  | Readonly<{ kind: "unary"; operator: UnaryOperator; operand: Expression }>
  | Readonly<{
      kind: "binary";
      operator: BinaryOperator;
      left: Expression;
      right: Expression;
    }>
  | Readonly<{ kind: "call"; name: string; arguments: readonly Expression[] }>;

export const formatCellReference = (reference: CellReference): string => {
  const columnPrefix = reference.columnAbsolute ? "$" : "";
  const rowPrefix = reference.rowAbsolute ? "$" : "";
  return `${columnPrefix}${columnLabel(reference.address.column)}${rowPrefix}${reference.address.row}`;
};
