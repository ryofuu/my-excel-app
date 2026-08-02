import { columnLabel, type CellAddress } from "../cell-address.vo";
import type { Literal } from "../cell-content.vo";

/**
 * Formula 内に保持する Text Level の Cell 参照。
 * address は現在位置での参照先を示し、絶対参照 Flag は Formula のコピー時に使う。
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

/** Formula内の1つの式を表す抽象構文木。 */
export type ExpressionAST =
  | Readonly<{ kind: "literal"; literal: Literal }>
  | Readonly<{ kind: "reference"; reference: CellReference }>
  | Readonly<{ kind: "range"; range: RangeReference }>
  | Readonly<{ kind: "unary"; operator: UnaryOperator; operand: ExpressionAST }>
  | Readonly<{
      kind: "binary";
      operator: BinaryOperator;
      left: ExpressionAST;
      right: ExpressionAST;
    }>
  | Readonly<{ kind: "call"; name: string; arguments: readonly ExpressionAST[] }>;

export const formatCellReference = (reference: CellReference): string => {
  const columnPrefix = reference.columnAbsolute ? "$" : "";
  const rowPrefix = reference.rowAbsolute ? "$" : "";
  return `${columnPrefix}${columnLabel(reference.address.column)}${rowPrefix}${reference.address.row}`;
};
