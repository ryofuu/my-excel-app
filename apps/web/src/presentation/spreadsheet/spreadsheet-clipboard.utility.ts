import type { WorkbookView } from "@/usecases/spreadsheet-client.port";
import type { WorkbookRevisionDraft } from "./workbook-revision.draft";

import {
  cellAddress,
  parseAddress,
} from "./spreadsheet-grid.utility";
import {
  selectionBounds,
  type SpreadsheetSelection,
} from "./spreadsheet-selection.utility";

export type InternalClipboardCell = Readonly<{
  input: string;
  sourceAddress: string;
}>;

export type SpreadsheetClipboard =
  | Readonly<{
      kind: "internal";
      rows: readonly (readonly InternalClipboardCell[])[];
      text: string;
    }>
  | Readonly<{
      kind: "external";
      rows: readonly (readonly Readonly<{ input: string }>[])[];
      text: string;
    }>;

export const spreadsheetClipboard = (
  workbook: WorkbookView,
  selection: SpreadsheetSelection,
): SpreadsheetClipboard => {
  const bounds = selectionBounds(selection);
  const rows: InternalClipboardCell[][] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    const cells: InternalClipboardCell[] = [];
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
    kind: "internal",
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
    kind: "external",
    rows,
    text: rows.map((row) => row.map((cell) => cell.input).join("\t")).join("\n"),
  };
};

export const revisionDraftForPaste = (
  clipboard: SpreadsheetClipboard,
  targetAddress: string,
): WorkbookRevisionDraft => {
  const target = parseAddress(targetAddress);
  if (target === null) {
    throw new RangeError(`Invalid paste target: ${targetAddress}.`);
  }
  if (clipboard.kind === "internal") {
    return {
      kind: "copy-cells",
      copies: clipboard.rows.flatMap((row, rowOffset) =>
        row.map((cell, columnOffset) => ({
          sourceAddress: cell.sourceAddress,
          targetAddress: cellAddress({
            column: target.column + columnOffset,
            row: target.row + rowOffset,
          }),
        })),
      ),
    };
  }

  return {
    kind: "set-cell-contents",
    inputs: clipboard.rows.flatMap((row, rowOffset) =>
      row.map((cell, columnOffset) => ({
        address: cellAddress({
          column: target.column + columnOffset,
          row: target.row + rowOffset,
        }),
        input: cell.input,
      })),
    ),
  };
};
