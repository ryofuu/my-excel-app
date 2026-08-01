import { describe, expect, it } from "vitest";

import {
  selectedAddresses,
  selectionBounds,
  selectionLabel,
  type SpreadsheetSelection,
} from "./spreadsheet-selection.utility";

describe("spreadsheet selection", () => {
  it("normalizes a reverse drag into one rectangular range", () => {
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
