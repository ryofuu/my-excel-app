import {
  cellId,
  cellIdParts,
  dependentsOf,
  formatA1Address,
  formatCellValue,
  parseA1Address,
  type CalculationSnapshot,
  type CellContent,
  type CellId,
  type CellValue,
  type Dependency,
  type FormulaToken as EngineFormulaToken,
  type WorksheetId,
} from "@gridline/spreadsheet/domain";
import type { WorkbookState } from "@gridline/spreadsheet/usecases";

import type {
  CalculationInspection,
  CellView,
  FormulaToken,
  SpreadsheetValue,
  WorkbookView,
} from "@/usecases/spreadsheet-client.port";

export type CalculatedWorkbookState = WorkbookState &
  Readonly<{ snapshot: CalculationSnapshot }>;

const contentInput = (content: CellContent | null): string => {
  if (content === null) return "";
  if (content.kind === "formula") return content.source;
  switch (content.literal.kind) {
    case "number":
      return String(content.literal.value);
    case "boolean":
      return content.literal.value ? "TRUE" : "FALSE";
    case "text":
      return content.literal.value;
  }
};

const cellAddressFor = (id: CellId): string =>
  formatA1Address(cellIdParts(id).address);

const belongsToWorksheet = (
  id: CellId,
  worksheetId: WorksheetId,
): boolean => cellIdParts(id).worksheetId === worksheetId;

const worksheetAddresses = (
  ids: readonly CellId[],
  worksheetId: WorksheetId,
): readonly string[] =>
  ids
    .filter((id) => belongsToWorksheet(id, worksheetId))
    .map(cellAddressFor);

const spreadsheetValue = (value: CellValue): SpreadsheetValue => {
  switch (value.kind) {
    case "blank":
      return { kind: "blank", display: "" };
    case "number":
      return { kind: "number", raw: value.value, display: formatCellValue(value) };
    case "text":
      return { kind: "text", raw: value.value, display: value.value };
    case "boolean":
      return { kind: "boolean", raw: value.value, display: formatCellValue(value) };
    case "error":
      return {
        kind: "error",
        display: formatCellValue(value),
        errorCode: value.code,
        origin: cellAddressFor(value.origin),
      };
  }
};

const tokenKind = (token: EngineFormulaToken): FormulaToken["kind"] => {
  switch (token.kind) {
    case "number":
      return "number";
    case "reference":
      return "reference";
    case "operator":
      return "operator";
    case "identifier":
      return "function";
    case "left-paren":
    case "right-paren":
    case "comma":
    case "colon":
      return "punctuation";
    case "text":
    case "boolean":
    case "invalid":
    case "eof":
      return "text";
  }
};

const inspectionTokens = (
  tokens: readonly EngineFormulaToken[],
): readonly FormulaToken[] =>
  tokens
    .filter((token) => token.kind !== "eof")
    .map((token) => ({ kind: tokenKind(token), lexeme: token.lexeme }));

const dependencyLabel = (dependency: Dependency): string => {
  if (dependency.kind === "cell") {
    return cellAddressFor(dependency.precedent);
  }
  return `${formatA1Address(dependency.start)}:${formatA1Address(dependency.end)}`;
};

export const workbookView = (
  state: CalculatedWorkbookState,
  worksheetId: WorksheetId,
): WorkbookView => {
  const cells = new Map<string, CellView>();
  for (const [id, cell] of state.revision.cells) {
    const parts = cellIdParts(id);
    if (parts.worksheetId !== worksheetId) continue;
    const address = formatA1Address(parts.address);
    cells.set(address, {
      address,
      input: contentInput(cell.content),
      value: spreadsheetValue(state.snapshot.values.get(id) ?? { kind: "blank" }),
      modifiedRevision: Number(cell.modifiedRevision),
    });
  }
  return {
    id: state.workbook.id,
    name: state.workbook.name,
    worksheets: state.revision.worksheets.map((worksheet) => ({
      id: String(worksheet.id),
      name: String(worksheet.name),
    })),
    activeWorksheetId: String(worksheetId),
    revision: Number(state.revision.number),
    cells,
    dirtyCells: worksheetAddresses(
      state.snapshot.trace.dirtyCellIds,
      worksheetId,
    ),
    evaluationOrder: worksheetAddresses(
      state.snapshot.trace.evaluationOrder,
      worksheetId,
    ),
  };
};

export const calculationInspection = (
  state: CalculatedWorkbookState,
  worksheetId: WorksheetId,
  address: string,
): CalculationInspection => {
  const normalizedAddress = parseA1Address(address);
  const id = cellId(worksheetId, normalizedAddress);
  const cell = state.revision.cells.get(id);
  const analysis = state.snapshot.formulas.get(id);
  const dependencies = state.snapshot.graph.precedentsByCell.get(id) ?? [];
  const errors = [...state.snapshot.values]
    .filter(
      ([errorId, value]) =>
        belongsToWorksheet(errorId, worksheetId) && value.kind === "error",
    )
    .map(([errorId, value]) => {
      if (value.kind !== "error") return "";
      return `${cellAddressFor(errorId)}: ${formatCellValue(value)} — ${value.message}`;
    });

  return {
    address: formatA1Address(normalizedAddress),
    source: cell === undefined ? null : contentInput(cell.content),
    tokens: analysis ? inspectionTokens(analysis.parse.tokens) : [],
    ast:
      analysis?.parse.kind === "success"
        ? JSON.stringify(analysis.parse.expression, null, 2)
        : analysis?.parse.kind === "error"
          ? `ParseError: ${analysis.parse.error.message}`
          : null,
    precedents: dependencies.map(dependencyLabel),
    dependents: dependentsOf(state.snapshot.graph, id).map(cellAddressFor),
    dirtyCells: worksheetAddresses(
      state.snapshot.trace.dirtyCellIds,
      worksheetId,
    ),
    evaluationOrder: worksheetAddresses(
      state.snapshot.trace.evaluationOrder,
      worksheetId,
    ),
    errors,
  };
};
