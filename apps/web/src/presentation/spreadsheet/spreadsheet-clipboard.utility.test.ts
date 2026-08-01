import { describe, expect, it } from "vitest";

import type { WorkbookView } from "@/usecases/spreadsheet-client.port";

import {
  cellInputsForPaste,
  spreadsheetClipboard,
  spreadsheetClipboardFromText,
} from "./spreadsheet-clipboard.utility";

const workbook = (): WorkbookView => ({
  id: "workbook-1",
  name: "Workbook",
  worksheetName: "Sheet1",
  revision: 0,
  cells: new Map([
    [
      "A1",
      {
        address: "A1",
        input: "1",
        value: { kind: "number", raw: 1, display: "1" },
        modifiedRevision: 0,
      },
    ],
    [
      "B1",
      {
        address: "B1",
        input: "=A1*2",
        value: { kind: "number", raw: 2, display: "2" },
        modifiedRevision: 0,
      },
    ],
    [
      "B2",
      {
        address: "B2",
        input: "label",
        value: { kind: "text", raw: "label", display: "label" },
        modifiedRevision: 0,
      },
    ],
  ]),
  dirtyCells: [],
  evaluationOrder: [],
});

describe("spreadsheet clipboard", () => {
  it("copies a rectangular TSV range and maps it from a paste origin", () => {
    const clipboard = spreadsheetClipboard(workbook(), {
      anchor: "A1",
      focus: "B2",
    });

    expect(clipboard.text).toBe("1\t=A1*2\n\tlabel");
    expect(cellInputsForPaste(clipboard, "D5")).toEqual([
      { address: "D5", input: "1", copiedFromAddress: "A1" },
      { address: "E5", input: "=A1*2", copiedFromAddress: "B1" },
      { address: "D6", input: "", copiedFromAddress: "A2" },
      { address: "E6", input: "label", copiedFromAddress: "B2" },
    ]);
  });

  it("parses external clipboard text without inventing source addresses", () => {
    const clipboard = spreadsheetClipboardFromText("1\t2\r\n3\t=A1\r\n");

    expect(cellInputsForPaste(clipboard, "D5")).toEqual([
      { address: "D5", input: "1" },
      { address: "E5", input: "2" },
      { address: "D6", input: "3" },
      { address: "E6", input: "=A1" },
    ]);
  });
});
