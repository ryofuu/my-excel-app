import { createInMemoryRepositories } from "@gridline/core/testing";
import {
  parseA1Address,
  parseCellInput,
  recalculate,
  worksheetId,
  type Workbook,
} from "@gridline/core/domain";
import { describe, expect, it } from "vitest";

import type { SpreadsheetClient } from "./spreadsheet-client.port";
import { createSpreadsheetClient } from "./spreadsheet-client";

const localCalculationObservations = {
  create: async (workbook: Workbook) => recalculate(workbook),
};

const createTestSpreadsheetClient = (
  repositorySource: Parameters<typeof createSpreadsheetClient>[0],
) => createSpreadsheetClient(repositorySource, localCalculationObservations);

const setCellContents = (
  client: SpreadsheetClient,
  inputs: readonly Readonly<{ address: string; input: string }>[],
) =>
  client.createRevision({
    kind: "set-cell-contents",
    changes: inputs.map((input) => ({
      address: parseA1Address(input.address),
      content: parseCellInput(input.input),
    })),
  });

describe("SpreadsheetClient integration", () => {
  it("空のWorksheetを作成して開く", async () => {
    const repositories = createInMemoryRepositories();
    const client = createTestSpreadsheetClient(async () => repositories);
    const opened = await client.open();

    const created = await client.createWorksheet();

    expect(created.revision).toBe(1);
    expect(created.worksheets.map((worksheet) => worksheet.name)).toEqual([
      "Sheet1",
      "Sheet2",
    ]);
    expect(created.activeWorksheetId).not.toBe(opened.activeWorksheetId);
    expect(created.cells.size).toBe(0);
    expect((await client.inspect(parseA1Address("A1"))).errors).toEqual([]);
    const firstWorksheet = await client.open(
      worksheetId(opened.activeWorksheetId),
    );
    expect(firstWorksheet.cells.get("C4")?.value.raw).toBe(480);
    client.dispose();
  });

  it("最後のWorksheetは残しつつ選択中のWorksheetとそのCellを削除する", async () => {
    const repositories = createInMemoryRepositories();
    const client = createTestSpreadsheetClient(async () => repositories);
    const opened = await client.open();
    await client.createWorksheet();
    await setCellContents(client, [{ address: "A1", input: "42" }]);

    const deleted = await client.deleteWorksheet();

    expect(deleted.revision).toBe(3);
    expect(deleted.worksheets).toEqual([
      { id: opened.activeWorksheetId, name: "Sheet1" },
    ]);
    expect(deleted.activeWorksheetId).toBe(opened.activeWorksheetId);
    expect(deleted.cells.get("C4")?.value.raw).toBe(480);
    await expect(client.deleteWorksheet()).rejects.toThrow(
      "at least one Worksheet",
    );
    client.dispose();
  });

  it("1つのRepository経路で開く・編集・Recalculation・検査を行う", async () => {
    const repositories = createInMemoryRepositories();
    const observedRevisions: number[] = [];
    const client = createSpreadsheetClient(async () => repositories, {
      create: async (workbook) => {
        observedRevisions.push(Number(workbook.revision.number));
        return recalculate(workbook);
      },
    });

    const opened = await client.open();
    expect(opened.revision).toBe(0);
    expect(opened.cells.get("C4")?.value).toMatchObject({
      kind: "number",
      raw: 480,
    });

    const edited = await setCellContents(client, [{ address: "A4", input: "1500" }]);
    expect(edited.revision).toBe(1);
    expect(edited.cells.get("C4")?.value).toMatchObject({
      kind: "number",
      raw: 780,
    });
    expect(edited.dirtyCells).toContain("C4");

    const inspection = await client.inspect(parseA1Address("C4"));
    expect(inspection.source).toBe("=A4-B4");
    expect(inspection.precedents).toEqual(["A4", "B4"]);

    const recalculated = await client.recalculate();
    expect(recalculated.revision).toBe(1);
    expect(recalculated.cells.get("C4")?.value.raw).toBe(780);
    expect(observedRevisions).toEqual([0, 1, 1]);

    client.dispose();
    await expect(client.open()).rejects.toThrow("disposed");
    await expect(
      setCellContents(client, [{ address: "A4", input: "1" }]),
    ).rejects.toThrow("disposed");
    await expect(client.inspect(parseA1Address("C4"))).rejects.toThrow(
      "disposed",
    );
    await expect(client.recalculate()).rejects.toThrow("disposed");
  });

  it("永続状態に対応する現在のWorkbookRevisionを開く", async () => {
    const repositories = createInMemoryRepositories();
    const first = createTestSpreadsheetClient(async () => repositories);
    await first.open();
    await setCellContents(first, [{ address: "B4", input: "500" }]);
    first.dispose();

    const second = createTestSpreadsheetClient(async () => repositories);
    const reopened = await second.open();

    expect(reopened.revision).toBe(1);
    expect(reopened.cells.get("B4")?.value.raw).toBe(500);
    expect(reopened.cells.get("C4")?.value.raw).toBe(700);
    second.dispose();
  });

  it("コピーした複数のCellを1つのWorkbookRevisionで作成する", async () => {
    const repositories = createInMemoryRepositories();
    const client = createTestSpreadsheetClient(async () => repositories);
    await client.open();

    const pasted = await client.createRevision({
      kind: "copy-cells",
      copies: [
        { source: parseA1Address("C4"), target: parseA1Address("E10") },
        { source: parseA1Address("D4"), target: parseA1Address("F10") },
      ],
    });

    expect(pasted.revision).toBe(1);
    expect(pasted.cells.get("E10")?.input).toBe("=C10-D10");
    expect(pasted.cells.get("F10")?.input).toBe("=E10/C10");
    client.dispose();
  });

  it("2つのclientが固定Workbookを同時作成しても同じ状態に収束する", async () => {
    const repositories = createInMemoryRepositories();
    const first = createTestSpreadsheetClient(async () => repositories);
    const second = createTestSpreadsheetClient(async () => repositories);

    const [firstView, secondView] = await Promise.all([
      first.open(),
      second.open(),
    ]);

    expect(firstView.revision).toBe(0);
    expect(secondView.revision).toBe(0);
    expect(firstView.cells.get("C4")?.value.raw).toBe(480);
    expect(secondView.cells.get("C4")?.value.raw).toBe(480);
    first.dispose();
    second.dispose();
  });

  it("一時状態を作らずSQLiteサーバーのErrorを呼び出し元へ返す", async () => {
    const client = createTestSpreadsheetClient(async () => {
      throw new Error("SQLite server unavailable");
    });

    await expect(client.open()).rejects.toThrow("SQLite server unavailable");
    client.dispose();
  });

  it("非同期のopenをdisposeで中断した後はactiveにしない", async () => {
    const repositories = createInMemoryRepositories();
    let release!: (value: typeof repositories) => void;
    const client = createTestSpreadsheetClient(
      () =>
        new Promise<typeof repositories>((resolve) => {
          release = resolve;
        }),
    );

    const opening = client.open();
    client.dispose();
    release(repositories);

    await expect(opening).rejects.toThrow("disposed");
    await expect(client.open()).rejects.toThrow("disposed");
  });
});
