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
  worksheets: [{ id: "worksheet-1", name: "Sheet1" }],
  activeWorksheetId: "worksheet-1",
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

describe("Spreadsheetのクリップボード", () => {
  it("長方形の範囲をTSVとしてコピーし貼り付け開始位置からCellへ割り当てる", () => {
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

  it("外部のクリップボード文字列を存在しないコピー元アドレスなしで解析する", () => {
    const clipboard = spreadsheetClipboardFromText("1\t2\r\n3\t=A1\r\n");

    expect(cellInputsForPaste(clipboard, "D5")).toEqual([
      { address: "D5", input: "1" },
      { address: "E5", input: "2" },
      { address: "D6", input: "3" },
      { address: "E6", input: "=A1" },
    ]);
  });
});
