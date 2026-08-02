import { describe, expect, it } from "vitest";
import {
  MAX_COLUMN_NUMBER,
  MAX_ROW_NUMBER,
  columnNumber,
  revisionNumber,
  rowNumber,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
} from "../index";

describe("識別子のValue Object", () => {
  describe("永続的な識別子", () => {
    it.each([
      ["WorkbookId", workbookId],
      ["WorksheetId", worksheetId],
    ] as const)("%sは入力された文字列を保持する", (_label, createId) => {
      expect(createId("stable-id")).toBe("stable-id");
    });

    it.each([
      ["WorkbookId", "空文字", "", workbookId],
      ["WorkbookId", "空白だけの文字列", "   ", workbookId],
      ["WorkbookId", "CellIdの区切り文字を含む文字列", "book!1", workbookId],
      ["WorksheetId", "空文字", "", worksheetId],
      ["WorksheetId", "空白だけの文字列", "   ", worksheetId],
      ["WorksheetId", "CellIdの区切り文字を含む文字列", "sheet!1", worksheetId],
    ] as const)("%sは%sを拒否する", (_label, _inputDescription, value, createId) => {
      expect(() => createId(value)).toThrow();
    });
  });

  describe("利用者が変更できる名前", () => {
    it.each([
      ["WorkbookName", workbookName],
      ["WorksheetName", worksheetName],
    ] as const)("%sは入力された文字列を保持する", (_label, createName) => {
      expect(createName("集計表")).toBe("集計表");
    });

    it.each([
      ["WorkbookName", "空文字", "", workbookName],
      ["WorkbookName", "空白だけの文字列", "   ", workbookName],
      ["WorksheetName", "空文字", "", worksheetName],
      ["WorksheetName", "空白だけの文字列", "   ", worksheetName],
    ] as const)("%sは%sを拒否する", (_label, _inputDescription, value, createName) => {
      expect(() => createName(value)).toThrow();
    });
  });

  describe("WorkbookRevisionの番号", () => {
    it.each([0, 1, Number.MAX_SAFE_INTEGER])("非負の安全な整数「%s」を保持する", (value) => {
      expect(revisionNumber(value)).toBe(value);
    });

    it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
      "非負の安全な整数ではない「%s」を拒否する",
      (value) => {
        expect(() => revisionNumber(value)).toThrow();
      },
    );
  });

  describe("CellAddressの行と列", () => {
    it.each([1, MAX_ROW_NUMBER])("範囲内のRowNumber %sを保持する", (value) => {
      expect(rowNumber(value)).toBe(value);
    });

    it.each([0, 1.5, MAX_ROW_NUMBER + 1])("範囲外のRowNumber %sを拒否する", (value) => {
      expect(() => rowNumber(value)).toThrow();
    });

    it.each([1, MAX_COLUMN_NUMBER])("範囲内のColumnNumber %sを保持する", (value) => {
      expect(columnNumber(value)).toBe(value);
    });

    it.each([0, 1.5, MAX_COLUMN_NUMBER + 1])("範囲外のColumnNumber %sを拒否する", (value) => {
      expect(() => columnNumber(value)).toThrow();
    });
  });
});
