import type {
  CellInput,
  WorkbookView,
} from "@/usecases/spreadsheet-client.port";

import {
  cellAddress,
  parseAddress,
} from "./spreadsheet-grid.utility";
import {
  selectionBounds,
  type SpreadsheetSelection,
} from "./spreadsheet-selection.utility";

export type SpreadsheetClipboardCell = Readonly<{
  input: string;
  sourceAddress?: string;
}>;

export type SpreadsheetClipboard = Readonly<{
  rows: readonly (readonly SpreadsheetClipboardCell[])[];
  text: string;
}>;

export const spreadsheetClipboard = (
  workbook: WorkbookView,
  selection: SpreadsheetSelection,
): SpreadsheetClipboard => {
  const bounds = selectionBounds(selection);
  const rows: SpreadsheetClipboardCell[][] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    const cells: SpreadsheetClipboardCell[] = [];
    for (
      let column = bounds.startColumn;
      column <= bounds.endColumn;
      column += 1
    ) {
      const address = cellAddress({ column, row });
      cells.push({
        input: workbook.cells.get(address)?.input ?? "",
        sourceAddress: address,
      });
    }
    rows.push(cells);
  }
  return {
    rows,
    text: rows.map((row) => row.map((cell) => cell.input).join("\t")).join("\n"),
  };
};

export const spreadsheetClipboardFromText = (
  text: string,
): SpreadsheetClipboard => {
  const normalized = text.replace(/\r\n?/g, "\n");
  const content = normalized.endsWith("\n")
    ? normalized.slice(0, -1)
    : normalized;
  const rows = content
    .split("\n")
    .map((row) => row.split("\t").map((input) => ({ input })));
  return {
    rows,
    text: rows.map((row) => row.map((cell) => cell.input).join("\t")).join("\n"),
  };
};

export const cellInputsForPaste = (
  clipboard: SpreadsheetClipboard,
  targetAddress: string,
): readonly CellInput[] => {
  const target = parseAddress(targetAddress);
  if (target === null) {
    throw new RangeError(`Invalid paste target: ${targetAddress}.`);
  }
  return clipboard.rows.flatMap((row, rowOffset) =>
    row.map((cell, columnOffset) => ({
      address: cellAddress({
        column: target.column + columnOffset,
        row: target.row + rowOffset,
      }),
      input: cell.input,
      ...(cell.sourceAddress === undefined
        ? {}
        : { copiedFromAddress: cell.sourceAddress }),
    })),
  );
};
