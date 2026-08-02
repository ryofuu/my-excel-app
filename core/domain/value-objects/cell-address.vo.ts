import {
  columnNumber,
  rowNumber,
  worksheetId,
  type ColumnNumber,
  type RowNumber,
  type WorksheetId,
} from "./identifiers.vo";
import { brand, type Brand } from "./brand.type";

type CellAddressValue = Readonly<{
  row: RowNumber;
  column: ColumnNumber;
}>;

export type CellAddress = Brand<CellAddressValue, "CellAddress">;

export type CellId = Brand<string, "CellId">;

export type CellIdParts = Readonly<{
  worksheetId: WorksheetId;
  address: CellAddress;
}>;

export const cellAddress = (row: number, column: number): CellAddress =>
  brand<CellAddressValue, "CellAddress">({
    row: rowNumber(row),
    column: columnNumber(column),
  });

export const columnLabel = (column: ColumnNumber): string => {
  let remaining = Number(column);
  let label = "";

  while (remaining > 0) {
    const remainder = (remaining - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    remaining = Math.floor((remaining - 1) / 26);
  }

  return label;
};

export const columnFromLabel = (label: string): ColumnNumber => {
  if (!/^[A-Za-z]+$/.test(label)) {
    throw new Error(`Invalid column label: ${label}`);
  }

  let result = 0;
  for (const character of label.toUpperCase()) {
    result = result * 26 + character.charCodeAt(0) - 64;
  }

  return columnNumber(result);
};

export const formatA1Address = (address: CellAddress): string =>
  `${columnLabel(address.column)}${address.row}`;

export const parseA1Address = (value: string): CellAddress => {
  const match = /^([A-Za-z]+)([1-9]\d*)$/.exec(value);
  if (match === null) {
    throw new Error(`Invalid A1 address: ${value}`);
  }

  const [, columnLabelText, rowText] = match;
  if (columnLabelText === undefined || rowText === undefined) {
    throw new Error(`Invalid A1 address: ${value}`);
  }

  return cellAddress(Number(rowText), Number(columnFromLabel(columnLabelText)));
};

export const cellId = (worksheetId: WorksheetId, address: CellAddress): CellId =>
  brand<string, "CellId">(`${worksheetId}!${formatA1Address(address)}`);

export const parseCellId = (value: string): CellId => {
  const separator = value.indexOf("!");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid CellId: ${value}`);
  }
  return cellId(
    worksheetId(value.slice(0, separator)),
    parseA1Address(value.slice(separator + 1)),
  );
};

export const cellIdParts = (value: CellId): CellIdParts => {
  const separator = value.indexOf("!");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid CellId: ${value}`);
  }

  const worksheet = value.slice(0, separator);
  const address = value.slice(separator + 1);

  return {
    worksheetId: worksheetId(worksheet),
    address: parseA1Address(address),
  };
};

export const cellAddressEquals = (left: CellAddress, right: CellAddress): boolean =>
  left.row === right.row && left.column === right.column;

export const isAddressWithin = (
  address: CellAddress,
  first: CellAddress,
  second: CellAddress,
): boolean => {
  const minimumRow = Math.min(first.row, second.row);
  const maximumRow = Math.max(first.row, second.row);
  const minimumColumn = Math.min(first.column, second.column);
  const maximumColumn = Math.max(first.column, second.column);

  return (
    address.row >= minimumRow &&
    address.row <= maximumRow &&
    address.column >= minimumColumn &&
    address.column <= maximumColumn
  );
};
