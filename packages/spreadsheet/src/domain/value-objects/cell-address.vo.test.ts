import { describe, expect, it } from "vitest";
import {
  cellAddress,
  cellAddressEquals,
  cellId,
  cellIdParts,
  columnFromLabel,
  columnLabel,
  formatA1Address,
  isAddressWithin,
  parseA1Address,
  worksheetId,
} from "../index";

describe("CellAddress", () => {
  describe("列番号と列ラベルの変換", () => {
    it.each([
      [1, "A"],
      [26, "Z"],
      [27, "AA"],
      [52, "AZ"],
      [53, "BA"],
      [16_384, "XFD"],
    ] as const)("列番号%sをラベル%sへ変換する", (column, label) => {
      expect(columnLabel(column)).toBe(label);
    });

    it.each([
      ["A", 1],
      ["z", 26],
      ["AA", 27],
      ["xFd", 16_384],
    ] as const)("大文字小文字を区別せず列ラベル%sを列番号%sへ変換する", (label, column) => {
      expect(columnFromLabel(label)).toBe(column);
    });

    it.each(["", "A1", "$A", "あ", "XFE"])("不正な列ラベル「%s」を拒否する", (label) => {
      expect(() => columnFromLabel(label)).toThrow();
    });
  });

  describe("A1形式との変換", () => {
    it.each([
      ["A1", 1, 1],
      ["AA42", 42, 27],
      ["xFd1048576", 1_048_576, 16_384],
    ] as const)("A1形式の%sを行%s・列%sとして解析する", (input, row, column) => {
      expect(parseA1Address(input)).toEqual(cellAddress(row, column));
    });

    it("CellAddressを正規化されたA1形式へ変換する", () => {
      expect(formatA1Address(cellAddress(42, 27))).toBe("AA42");
    });

    it.each(["", "A0", "0", "$A$1", "A-1", "A1 ", " A1"])(
      "不正なA1形式「%s」を拒否する",
      (input) => {
        expect(() => parseA1Address(input)).toThrow();
      },
    );
  });

  describe("Workbook内のCellの識別", () => {
    it("WorksheetIdとCellAddressから作ったCellIdを元の要素へ戻せる", () => {
      const id = worksheetId("worksheet-1");
      const address = cellAddress(42, 27);

      expect(cellIdParts(cellId(id, address))).toEqual({ worksheetId: id, address });
    });
  });

  describe("CellAddress同士の関係", () => {
    it("行と列が同じCellAddressを等しいとみなす", () => {
      expect(cellAddressEquals(cellAddress(2, 3), cellAddress(2, 3))).toBe(true);
    });

    it("行または列が異なるCellAddressを等しいとみなさない", () => {
      expect([
        cellAddressEquals(cellAddress(2, 3), cellAddress(1, 3)),
        cellAddressEquals(cellAddress(2, 3), cellAddress(2, 4)),
      ]).toEqual([false, false]);
    });

    it("2つの端点を逆順で渡しても境界を含む長方形内か判定できる", () => {
      expect([
        isAddressWithin(cellAddress(2, 2), cellAddress(3, 3), cellAddress(1, 1)),
        isAddressWithin(cellAddress(1, 1), cellAddress(3, 3), cellAddress(1, 1)),
        isAddressWithin(cellAddress(4, 2), cellAddress(3, 3), cellAddress(1, 1)),
      ]).toEqual([true, true, false]);
    });
  });
});
