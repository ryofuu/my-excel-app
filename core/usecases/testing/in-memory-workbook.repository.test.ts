import { describe, expect, it } from "vitest";

import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellAddress,
  cellId,
  parseCellInput,
  revisionNumber,
  workbookChangeSet,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
} from "@gridline/core/domain";
import {
  createWorkbook,
  createWorkbookRevision,
  deleteWorkbook,
  findWorkbook,
} from "@gridline/core/usecases";

import { createInMemoryRepositories } from "./in-memory-workbook.repository";

const ids = {
  workbook: workbookId("workbook-1"),
  worksheet: worksheetId("worksheet-1"),
};

const worksheet = new Worksheet({
  id: ids.worksheet,
  name: worksheetName("Sheet1"),
});

const createTestWorkbook = (): Workbook => {
  const id = cellId(ids.worksheet, cellAddress(1, 1));
  return new Workbook({
    id: ids.workbook,
    name: workbookName("Budget"),
    revision: new WorkbookRevision({
      number: revisionNumber(0),
      worksheets: [worksheet],
      cells: new Map([
        [
          id,
          new Cell({
            id,
            content: parseCellInput("10"),
            modifiedRevision: revisionNumber(0),
          }),
        ],
      ]),
    }),
  });
};

describe("in-memory WorkbookRepository integration", () => {
  it("Workbookを作成・取得・削除する", async () => {
    const repositories = createInMemoryRepositories();
    const workbook = createTestWorkbook();

    await expect(createWorkbook(repositories, workbook)).resolves.toEqual({
      kind: "created",
    });
    await expect(findWorkbook(repositories, workbook.id)).resolves.toBe(workbook);

    await deleteWorkbook(repositories, workbook.id);
    await expect(findWorkbook(repositories, workbook.id)).resolves.toBeNull();
  });

  it("同じWorkbookを重複作成しない", async () => {
    const repositories = createInMemoryRepositories();
    const workbook = createTestWorkbook();
    await createWorkbook(repositories, workbook);

    await expect(createWorkbook(repositories, workbook)).resolves.toEqual({
      kind: "already-exists",
    });
  });

  it("UseCaseがDomainで次のRevisionを生成して保存する", async () => {
    const repositories = createInMemoryRepositories();
    const workbook = createTestWorkbook();
    await createWorkbook(repositories, workbook);
    const id = cellId(ids.worksheet, cellAddress(1, 1));

    const result = await createWorkbookRevision(
      repositories,
      workbookChangeSet({
        workbookId: workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [{ cellId: id, content: parseCellInput("20") }],
      }),
    );

    expect(result).toMatchObject({ kind: "created" });
    const saved = await findWorkbook(repositories, workbook.id);
    expect(saved?.revision.number).toBe(1);
    expect(saved?.revision.cells.get(id)).toMatchObject({
      content: { kind: "literal", literal: { kind: "number", value: 20 } },
      modifiedRevision: 1,
    });
  });

  it("CellContentを削除したCell EntityをRevisionへ残す", async () => {
    const repositories = createInMemoryRepositories();
    const workbook = createTestWorkbook();
    await createWorkbook(repositories, workbook);
    const id = cellId(ids.worksheet, cellAddress(1, 1));

    await createWorkbookRevision(
      repositories,
      workbookChangeSet({
        workbookId: workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [{ cellId: id, content: null }],
      }),
    );

    const saved = await findWorkbook(repositories, workbook.id);
    expect(saved?.revision.cells.get(id)).toMatchObject({
      content: null,
      modifiedRevision: 1,
    });
  });

  it("古いRevisionからの重ならないCell変更を順に適用する", async () => {
    const repositories = createInMemoryRepositories();
    const workbook = createTestWorkbook();
    await createWorkbook(repositories, workbook);
    const b1 = cellId(ids.worksheet, cellAddress(1, 2));
    const c1 = cellId(ids.worksheet, cellAddress(1, 3));

    for (const id of [b1, c1]) {
      const result = await createWorkbookRevision(
        repositories,
        workbookChangeSet({
          workbookId: workbook.id,
          baseRevision: revisionNumber(0),
          cellChanges: [{ cellId: id, content: parseCellInput("1") }],
        }),
      );
      expect(result.kind).toBe("created");
    }

    const saved = await findWorkbook(repositories, workbook.id);
    expect(saved?.revision.number).toBe(2);
    expect(saved?.revision.cells.has(b1)).toBe(true);
    expect(saved?.revision.cells.has(c1)).toBe(true);
  });

  it("古いRevisionから同じCellを変更するとEditConflictになる", async () => {
    const repositories = createInMemoryRepositories();
    const workbook = createTestWorkbook();
    await createWorkbook(repositories, workbook);
    const id = cellId(ids.worksheet, cellAddress(1, 1));
    const change = (content: string) =>
      workbookChangeSet({
        workbookId: workbook.id,
        baseRevision: revisionNumber(0),
        cellChanges: [{ cellId: id, content: parseCellInput(content) }],
      });

    await createWorkbookRevision(repositories, change("20"));
    const result = await createWorkbookRevision(repositories, change("30"));

    expect(result).toEqual({
      kind: "edit-conflict",
      conflictingCellIds: [id],
    });
  });

  it("Repository更新を期待Revisionでcompare-and-swapする", async () => {
    const repositories = createInMemoryRepositories();
    const workbook = createTestWorkbook();
    await createWorkbook(repositories, workbook);

    await expect(
      repositories.workbooks.update(workbook, revisionNumber(1)),
    ).resolves.toEqual({ kind: "concurrent-write" });
  });
});
