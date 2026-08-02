import { describe, expect, it } from "vitest";

import type { WorkbookView } from "@/usecases/spreadsheet-client.port";

import {
  revisionDraftForPaste,
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
    expect(revisionDraftForPaste(clipboard, "D5")).toEqual({
      kind: "copy-cells",
      copies: [
        { sourceAddress: "A1", targetAddress: "D5" },
        { sourceAddress: "B1", targetAddress: "E5" },
        { sourceAddress: "A2", targetAddress: "D6" },
        { sourceAddress: "B2", targetAddress: "E6" },
      ],
    });
  });

  it("外部のクリップボード文字列を存在しないコピー元アドレスなしで解析する", () => {
    const clipboard = spreadsheetClipboardFromText("1\t2\r\n3\t=A1\r\n");

    expect(revisionDraftForPaste(clipboard, "D5")).toEqual({
      kind: "set-cell-contents",
      inputs: [
        { address: "D5", input: "1" },
        { address: "E5", input: "2" },
        { address: "D6", input: "3" },
        { address: "E6", input: "=A1" },
      ],
    });
  });
});
