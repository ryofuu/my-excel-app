/**
 * A deliberately small boundary between the UI and the calculation runtime.
 *
 * The local implementation is useful while the browser repository is starting
 * up.  The real application adapter can implement this interface without the
 * React components knowing about entities, workers, or SQLite rows.
 */
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
  /** The source address is supplied only when input comes from a copied Cell. */
  readonly copiedFromAddress?: string;
};

export type SpreadsheetClient = {
  open(): Promise<WorkbookView>;
  createCell(input: CellInput): Promise<WorkbookView>;
  inspect(address: string): Promise<CalculationInspection>;
  recalculate(): Promise<WorkbookView>;
  dispose(): void;
};
