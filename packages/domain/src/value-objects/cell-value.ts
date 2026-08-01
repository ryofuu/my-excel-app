import type { CellId } from "./cell-address";
import type { Literal } from "./cell-content";

export type CellErrorCode =
  | "parse"
  | "type"
  | "division-by-zero"
  | "invalid-reference"
  | "circular-reference"
  | "unknown-function";

export type CellError = Readonly<{
  kind: "error";
  code: CellErrorCode;
  origin: CellId;
  message: string;
}>;

export type CellValue = Readonly<{ kind: "blank" }> | Literal | CellError;

export const BLANK: CellValue = { kind: "blank" };

export const errorValue = (
  code: CellErrorCode,
  origin: CellId,
  message: string,
): CellError => ({ kind: "error", code, origin, message });

export const literalValue = (literal: Literal): CellValue => literal;

export const isErrorValue = (value: CellValue): value is CellError => value.kind === "error";

export const cellValueEquals = (left: CellValue, right: CellValue): boolean => {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "blank" && right.kind === "blank") {
    return true;
  }
  if (left.kind === "error" && right.kind === "error") {
    return left.code === right.code && left.origin === right.origin && left.message === right.message;
  }
  if (left.kind !== "blank" && left.kind !== "error" && right.kind !== "blank" && right.kind !== "error") {
    return left.value === right.value;
  }

  return false;
};

export const formatCellValue = (value: CellValue): string => {
  switch (value.kind) {
    case "blank":
      return "";
    case "number":
      return String(value.value);
    case "text":
      return value.value;
    case "boolean":
      return value.value ? "TRUE" : "FALSE";
    case "error":
      switch (value.code) {
        case "division-by-zero":
          return "#DIV/0!";
        case "circular-reference":
          return "#CIRC!";
        case "parse":
          return "#PARSE!";
        case "invalid-reference":
          return "#REF!";
        case "unknown-function":
          return "#NAME?";
        case "type":
          return "#VALUE!";
      }
  }
};
