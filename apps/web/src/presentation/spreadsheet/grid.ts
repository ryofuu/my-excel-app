import type { SpreadsheetValue } from "@/usecases/spreadsheet-client";

export type GridCellAddress = Readonly<{
  column: number;
  row: number;
}>;

export const DEFAULT_COLUMN_COUNT = 52;
export const DEFAULT_ROW_COUNT = 2_000;

export const columnLabel = (column: number): string => {
  let label = "";
  let value = column;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
};

export const cellAddress = ({ column, row }: GridCellAddress): string =>
  `${columnLabel(column)}${row}`;

export const parseAddress = (address: string): GridCellAddress | null => {
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
};

export const formatValue = (value: SpreadsheetValue): string => value.display;
