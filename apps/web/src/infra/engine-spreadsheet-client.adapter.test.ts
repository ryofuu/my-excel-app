import { createInMemoryRepositories } from "@gridline/spreadsheet/infra";
import { describe, expect, it, vi } from "vitest";

import { createEngineSpreadsheetClient } from "./engine-spreadsheet-client.adapter";

describe("engine SpreadsheetClient integration", () => {
  it("opens, edits, recalculates, and inspects through one repository path", async () => {
    const repositories = createInMemoryRepositories();
    const client = createEngineSpreadsheetClient(async () => repositories);

    const opened = await client.open();
    expect(opened.revision).toBe(0);
    expect(opened.cells.get("C4")?.value).toMatchObject({
      kind: "number",
      raw: 480,
    });

    const edited = await client.createCells([{ address: "A4", input: "1500" }]);
    expect(edited.revision).toBe(1);
    expect(edited.cells.get("C4")?.value).toMatchObject({
      kind: "number",
      raw: 780,
    });
    expect(edited.dirtyCells).toContain("C4");

    const inspection = await client.inspect("C4");
    expect(inspection.source).toBe("=A4-B4");
    expect(inspection.precedents).toEqual(["A4", "B4"]);

    const recalculated = await client.recalculate();
    expect(recalculated.revision).toBe(1);
    expect(recalculated.cells.get("C4")?.value.raw).toBe(780);

    client.dispose();
    await expect(client.open()).rejects.toThrow("disposed");
    await expect(
      client.createCells([{ address: "A4", input: "1" }]),
    ).rejects.toThrow("disposed");
    await expect(client.inspect("C4")).rejects.toThrow("disposed");
    await expect(client.recalculate()).rejects.toThrow("disposed");
  });

  it("opens the matching current WorkbookRevision from persisted state", async () => {
    const repositories = createInMemoryRepositories();
    const first = createEngineSpreadsheetClient(async () => repositories);
    await first.open();
    await first.createCells([{ address: "B4", input: "500" }]);
    first.dispose();

    const second = createEngineSpreadsheetClient(async () => repositories);
    const reopened = await second.open();

    expect(reopened.revision).toBe(1);
    expect(reopened.cells.get("B4")?.value.raw).toBe(500);
    expect(reopened.cells.get("C4")?.value.raw).toBe(700);
    second.dispose();
  });

  it("creates multiple copied Cells in one WorkbookRevision", async () => {
    const repositories = createInMemoryRepositories();
    const client = createEngineSpreadsheetClient(async () => repositories);
    await client.open();

    const pasted = await client.createCells([
      { address: "E10", input: "=A4-B4", copiedFromAddress: "C4" },
      { address: "F10", input: "=C4/A4", copiedFromAddress: "D4" },
    ]);

    expect(pasted.revision).toBe(1);
    expect(pasted.cells.get("E10")?.input).toBe("=C10-D10");
    expect(pasted.cells.get("F10")?.input).toBe("=E10/C10");
    client.dispose();
  });

  it("converges when two clients create the fixed Workbook concurrently", async () => {
    const repositories = createInMemoryRepositories();
    const first = createEngineSpreadsheetClient(async () => repositories);
    const second = createEngineSpreadsheetClient(async () => repositories);

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

  it("uses the in-memory Repository Adapter when browser storage cannot start", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = createEngineSpreadsheetClient(async () => {
      throw new Error("Worker unavailable");
    });

    const opened = await client.open();
    const edited = await client.createCells([{ address: "A4", input: "1300" }]);

    expect(opened.revision).toBe(0);
    expect(edited.revision).toBe(1);
    expect(warning).toHaveBeenCalledOnce();
    client.dispose();
    warning.mockRestore();
  });

  it("does not activate after disposal interrupts an asynchronous open", async () => {
    const repositories = createInMemoryRepositories();
    let release!: (value: typeof repositories) => void;
    const client = createEngineSpreadsheetClient(
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
