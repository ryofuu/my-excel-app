import {
  cellAddress,
  parseAddress,
} from "./spreadsheet-grid.utility";

export type SpreadsheetSelection = Readonly<{
  anchor: string;
  focus: string;
}>;

export type SelectionBounds = Readonly<{
  startColumn: number;
  endColumn: number;
  startRow: number;
  endRow: number;
}>;

const coordinate = (address: string) => {
  const parsed = parseAddress(address);
  if (parsed === null) {
    throw new RangeError(`Invalid Cell address: ${address}.`);
  }
  return parsed;
};

export const selectionBounds = (
  selection: SpreadsheetSelection,
): SelectionBounds => {
  const anchor = coordinate(selection.anchor);
  const focus = coordinate(selection.focus);
  return {
    startColumn: Math.min(anchor.column, focus.column),
    endColumn: Math.max(anchor.column, focus.column),
    startRow: Math.min(anchor.row, focus.row),
    endRow: Math.max(anchor.row, focus.row),
  };
};

export const selectedAddresses = (
  selection: SpreadsheetSelection,
): readonly string[] => {
  const bounds = selectionBounds(selection);
  const addresses: string[] = [];
  for (let row = bounds.startRow; row <= bounds.endRow; row += 1) {
    for (
      let column = bounds.startColumn;
      column <= bounds.endColumn;
      column += 1
    ) {
      addresses.push(cellAddress({ column, row }));
    }
  }
  return addresses;
};

export const selectionLabel = (selection: SpreadsheetSelection): string => {
  const bounds = selectionBounds(selection);
  const start = cellAddress({
    column: bounds.startColumn,
    row: bounds.startRow,
  });
  const end = cellAddress({
    column: bounds.endColumn,
    row: bounds.endRow,
  });
  return start === end ? start : `${start}:${end}`;
};
