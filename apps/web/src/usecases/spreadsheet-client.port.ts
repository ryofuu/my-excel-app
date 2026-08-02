import type {
  CellAddress,
  CellContent,
  WorksheetId,
} from "@gridline/core/domain";

/**
 * UI と計算 Runtime の間に置く、意図的に小さな境界。
 * React Component は Entity、HTTP Resource、DB Record を知らずに操作できる。
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
  readonly worksheets: readonly WorksheetView[];
  readonly activeWorksheetId: string;
  readonly revision: number;
  readonly cells: ReadonlyMap<string, CellView>;
  readonly dirtyCells: readonly string[];
  readonly evaluationOrder: readonly string[];
};

export type WorksheetView = {
  readonly id: string;
  readonly name: string;
};

export type CreateWorkbookRevisionCommand =
  | Readonly<{
      kind: "set-cell-contents";
      changes: readonly Readonly<{
        address: CellAddress;
        content: CellContent | null;
      }>[];
    }>
  | Readonly<{
      kind: "copy-cells";
      copies: readonly Readonly<{
        source: CellAddress;
        target: CellAddress;
      }>[];
    }>;

export type SpreadsheetClient = {
  open(worksheetId?: WorksheetId): Promise<WorkbookView>;
  createWorksheet(): Promise<WorkbookView>;
  deleteWorksheet(): Promise<WorkbookView>;
  createRevision(command: CreateWorkbookRevisionCommand): Promise<WorkbookView>;
  inspect(address: CellAddress): Promise<CalculationInspection>;
  recalculate(): Promise<WorkbookView>;
  dispose(): void;
};
