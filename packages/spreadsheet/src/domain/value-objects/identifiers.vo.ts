import { brand, type Brand } from "./brand.type";

export type WorkbookId = Brand<string, "WorkbookId">;
export type WorksheetId = Brand<string, "WorksheetId">;
export type WorkbookName = Brand<string, "WorkbookName">;
export type WorksheetName = Brand<string, "WorksheetName">;
export type RevisionNumber = Brand<number, "RevisionNumber">;
export type RowNumber = Brand<number, "RowNumber">;
export type ColumnNumber = Brand<number, "ColumnNumber">;

export const MAX_ROW_NUMBER = 1_048_576;
export const MAX_COLUMN_NUMBER = 16_384;

const nonEmptyString = (value: string, label: string): string => {
  if (value.trim().length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return value;
};

const persistentId = <Name extends "WorkbookId" | "WorksheetId">(
  value: string,
  label: string,
): Brand<string, Name> => {
  nonEmptyString(value, label);

  if (value.includes("!")) {
    throw new Error(`${label} must not include "!" because it is reserved by CellId.`);
  }

  return brand<string, Name>(value);
};

export const workbookId = (value: string): WorkbookId => persistentId<"WorkbookId">(value, "WorkbookId");

export const worksheetId = (value: string): WorksheetId =>
  persistentId<"WorksheetId">(value, "WorksheetId");

export const workbookName = (value: string): WorkbookName =>
  brand<string, "WorkbookName">(nonEmptyString(value, "WorkbookName"));

export const worksheetName = (value: string): WorksheetName =>
  brand<string, "WorksheetName">(nonEmptyString(value, "WorksheetName"));

export const revisionNumber = (value: number): RevisionNumber => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("RevisionNumber must be a non-negative safe integer.");
  }

  return brand<number, "RevisionNumber">(value);
};

export const rowNumber = (value: number): RowNumber => {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_ROW_NUMBER) {
    throw new Error(`RowNumber must be an integer from 1 to ${MAX_ROW_NUMBER}.`);
  }

  return brand<number, "RowNumber">(value);
};

export const columnNumber = (value: number): ColumnNumber => {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_COLUMN_NUMBER) {
    throw new Error(`ColumnNumber must be an integer from 1 to ${MAX_COLUMN_NUMBER}.`);
  }

  return brand<number, "ColumnNumber">(value);
};
