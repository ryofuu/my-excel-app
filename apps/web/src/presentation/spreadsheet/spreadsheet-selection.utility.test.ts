import { describe, expect, it } from "vitest";

import {
  selectedAddresses,
  selectionBounds,
  selectionLabel,
  type SpreadsheetSelection,
} from "./spreadsheet-selection.utility";

describe("Spreadsheetの選択範囲", () => {
  it("逆方向のドラッグを1つの長方形範囲に正規化する", () => {
    const selection: SpreadsheetSelection = {
      anchor: "C3",
      focus: "A2",
    };

    expect(selectionBounds(selection)).toEqual({
      startColumn: 1,
      endColumn: 3,
      startRow: 2,
      endRow: 3,
    });
    expect(selectedAddresses(selection)).toEqual([
      "A2",
      "B2",
      "C2",
      "A3",
      "B3",
      "C3",
    ]);
    expect(selectionLabel(selection)).toBe("A2:C3");
  });
});
