import { brand, type Brand } from "./brand";

export type FormulaSource = Brand<string, "FormulaSource">;

export type Literal =
  | Readonly<{ kind: "number"; value: number }>
  | Readonly<{ kind: "text"; value: string }>
  | Readonly<{ kind: "boolean"; value: boolean }>;

export type CellContent =
  | Readonly<{ kind: "literal"; literal: Literal }>
  | Readonly<{ kind: "formula"; source: FormulaSource }>;

export const formulaSource = (value: string): FormulaSource => {
  if (!value.startsWith("=")) {
    throw new Error("FormulaSource must start with '='.");
  }

  return brand<string, "FormulaSource">(value);
};

export const numberLiteral = (value: number): Literal => {
  if (!Number.isFinite(value)) {
    throw new Error("A numeric literal must be finite.");
  }

  return { kind: "number", value };
};

export const textLiteral = (value: string): Literal => ({ kind: "text", value });

export const booleanLiteral = (value: boolean): Literal => ({ kind: "boolean", value });

export const literalContent = (literal: Literal): CellContent => ({ kind: "literal", literal });

export const formulaContent = (source: FormulaSource | string): CellContent => ({
  kind: "formula",
  source: typeof source === "string" ? formulaSource(source) : source,
});

const numericInput = /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;

/** Converts the raw text a user entered into the authoritative CellContent. */
export const parseCellInput = (input: string): CellContent | null => {
  if (input === "") {
    return null;
  }

  if (input.startsWith("=")) {
    return formulaContent(input);
  }

  if (input.startsWith("'")) {
    return literalContent(textLiteral(input.slice(1)));
  }

  if (/^true$/i.test(input)) {
    return literalContent(booleanLiteral(true));
  }

  if (/^false$/i.test(input)) {
    return literalContent(booleanLiteral(false));
  }

  if (numericInput.test(input)) {
    const value = Number(input);
    if (Number.isFinite(value)) {
      return literalContent(numberLiteral(value));
    }
  }

  return literalContent(textLiteral(input));
};

export const cellContentEquals = (
  left: CellContent | null | undefined,
  right: CellContent | null | undefined,
): boolean => {
  if (left === right) {
    return true;
  }
  if (left === null || left === undefined || right === null || right === undefined) {
    return false;
  }
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "formula" && right.kind === "formula") {
    return left.source === right.source;
  }
  if (left.kind === "literal" && right.kind === "literal") {
    return left.literal.kind === right.literal.kind && left.literal.value === right.literal.value;
  }

  return false;
};
