/**
 * A deliberately small boundary between the UI and the calculation runtime.
 *
 * The local implementation is useful while the browser repository is starting
 * up.  The real application adapter can implement this interface without the
 * React components knowing about entities, workers, or SQLite rows.
 */
export type CellAddress = {
  readonly column: number;
  readonly row: number;
};

export type ValueKind = "blank" | "number" | "text" | "boolean" | "error";

export type SpreadsheetValue = {
  readonly kind: ValueKind;
  readonly display: string;
  readonly raw?: number | string | boolean;
  readonly errorCode?: string;
  readonly origin?: string;
};

export type CellView = {
  readonly address: string;
  readonly input: string;
  readonly value: SpreadsheetValue;
  readonly modifiedRevision: number;
};

export type FormulaToken = {
  readonly kind: "number" | "reference" | "operator" | "function" | "punctuation" | "text";
  readonly lexeme: string;
};

export type CalculationInspection = {
  readonly address: string;
  readonly source: string | null;
  readonly tokens: readonly FormulaToken[];
  readonly ast: string | null;
  readonly precedents: readonly string[];
  readonly dependents: readonly string[];
  readonly dirtyCells: readonly string[];
  readonly evaluationOrder: readonly string[];
  readonly errors: readonly string[];
};

export type WorkbookView = {
  readonly id: string;
  readonly name: string;
  readonly worksheetName: string;
  readonly revision: number;
  readonly cells: ReadonlyMap<string, CellView>;
  readonly dirtyCells: readonly string[];
  readonly evaluationOrder: readonly string[];
};

export type CellInput = {
  readonly address: string;
  readonly input: string;
};

export type SpreadsheetClient = {
  open(): Promise<WorkbookView>;
  createCell(input: CellInput): Promise<WorkbookView>;
  inspect(address: string): Promise<CalculationInspection>;
  recalculate(): Promise<WorkbookView>;
  dispose(): void;
};

export const DEFAULT_COLUMN_COUNT = 52;
export const DEFAULT_ROW_COUNT = 2_000;

export function columnLabel(column: number): string {
  let label = "";
  let value = column;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

export function cellAddress({ column, row }: CellAddress): string {
  return `${columnLabel(column)}${row}`;
}

export function parseAddress(address: string): CellAddress | null {
  const match = /^([A-Z]+)([1-9][0-9]*)$/i.exec(address.trim());
  if (!match) return null;

  const letters = match[1]?.toUpperCase();
  const rowText = match[2];
  if (!letters || !rowText) return null;

  let column = 0;
  for (const character of letters) {
    column = column * 26 + character.charCodeAt(0) - 64;
  }

  return { column, row: Number(rowText) };
}

export function formatValue(value: SpreadsheetValue): string {
  return value.display;
}
