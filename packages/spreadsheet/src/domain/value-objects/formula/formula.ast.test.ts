import { describe, expect, it } from "vitest";
import { cellAddress, formatCellReference, type CellReference } from "../../index";

const reference = (
  columnAbsolute: boolean,
  rowAbsolute: boolean,
): CellReference => ({
  address: cellAddress(12, 28),
  columnAbsolute,
  rowAbsolute,
});

describe("CellReferenceの書式化", () => {
  it.each([
    [false, false, "AB12"],
    [true, false, "$AB12"],
    [false, true, "AB$12"],
    [true, true, "$AB$12"],
  ] as const)(
    "列の絶対参照が%s、行の絶対参照が%sなら%sになる",
    (columnAbsolute, rowAbsolute, expected) => {
      expect(formatCellReference(reference(columnAbsolute, rowAbsolute))).toBe(expected);
    },
  );
});
