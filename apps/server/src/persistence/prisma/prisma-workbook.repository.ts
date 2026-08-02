import {
  cellIdParts,
  type Cell,
  type Workbook,
  type WorkbookId,
} from "@gridline/core/domain";
import type { WorkbookRepository } from "@gridline/core/usecases";

import { Prisma, type PrismaClient } from "./generated/client";
import {
  contentJson,
  workbookFromRecord,
  workbookRecordInclude,
} from "./prisma-workbook.codec";

const worksheetRows = (workbook: Workbook) =>
  workbook.revision.worksheets.map((worksheet, position) => ({
    workbookId: String(workbook.id),
    id: String(worksheet.id),
    name: String(worksheet.name),
    position,
  }));

const cellRow = (workbookId: WorkbookId, cell: Cell) => {
  const parts = cellIdParts(cell.id);
  return {
    workbookId: String(workbookId),
    worksheetId: String(parts.worksheetId),
    rowNumber: Number(parts.address.row),
    columnNumber: Number(parts.address.column),
    contentJson: contentJson(cell.content),
    modifiedRevision: Number(cell.modifiedRevision),
  };
};

const findWorkbook = async (
  client: PrismaClient,
  id: WorkbookId,
): Promise<Workbook | null> => {
  const record = await client.workbookRecord.findUnique({
    where: { id: String(id) },
    include: workbookRecordInclude,
  });
  // Prisma の Record をそのまま外へ漏らさず、必ず不変条件を持つ Workbook に戻す。
  return record === null ? null : workbookFromRecord(record);
};

const persistWorksheetSnapshot = async (
  transaction: Prisma.TransactionClient,
  workbook: Workbook,
): Promise<void> => {
  const workbookId = String(workbook.id);
  const current = await transaction.worksheetRecord.findMany({
    where: { workbookId },
    orderBy: { position: "asc" },
  });
  const nextIds = new Set(
    workbook.revision.worksheets.map((worksheet) => String(worksheet.id)),
  );
  const removedIds = current
    .filter((worksheet) => !nextIds.has(worksheet.id))
    .map((worksheet) => worksheet.id);
  if (removedIds.length > 0) {
    // Worksheet 削除時の配下 Cell 削除は、DB の外部キー Cascade に任せて一貫して処理する。
    await transaction.worksheetRecord.deleteMany({
      where: { workbookId, id: { in: removedIds } },
    });
  }

  const retained = current.filter((worksheet) => nextIds.has(worksheet.id));
  // name / position の一意制約にぶつからず入れ替えられるよう、既存値を一時領域へ退避する。
  for (const worksheet of retained) {
    await transaction.worksheetRecord.update({
      where: {
        workbookId_id: { workbookId, id: worksheet.id },
      },
      data: {
        name: `\0${worksheet.id}`,
        position: worksheet.position + 1_000_000,
      },
    });
  }

  const retainedIds = new Set(retained.map((worksheet) => worksheet.id));
  for (const worksheet of worksheetRows(workbook)) {
    if (retainedIds.has(worksheet.id)) {
      await transaction.worksheetRecord.update({
        where: {
          workbookId_id: { workbookId, id: worksheet.id },
        },
        data: { name: worksheet.name, position: worksheet.position },
      });
    } else {
      await transaction.worksheetRecord.create({ data: worksheet });
    }
  }
};

const persistModifiedCells = async (
  transaction: Prisma.TransactionClient,
  workbook: Workbook,
): Promise<void> => {
  // Domain が今回の Revision で変更した Cell だけを保存する。
  // content: null も行を消さずに Upsert し、削除が起きた Revision を保持する。
  for (const cell of workbook.revision.cells.values()) {
    if (cell.modifiedRevision !== workbook.revision.number) continue;
    const row = cellRow(workbook.id, cell);
    await transaction.cellRecord.upsert({
      where: {
        workbookId_worksheetId_rowNumber_columnNumber: {
          workbookId: row.workbookId,
          worksheetId: row.worksheetId,
          rowNumber: row.rowNumber,
          columnNumber: row.columnNumber,
        },
      },
      create: row,
      update: {
        contentJson: row.contentJson,
        modifiedRevision: row.modifiedRevision,
      },
    });
  }
};

export const createPrismaWorkbookRepository = (
  client: PrismaClient,
): WorkbookRepository => ({
  create: async (workbook) => {
    try {
      // Aggregate 全体を1 Transaction で作り、Workbook だけが残る中間状態を作らない。
      await client.$transaction(async (transaction) => {
        await transaction.workbookRecord.create({
          data: {
            id: String(workbook.id),
            name: String(workbook.name),
            currentRevision: Number(workbook.revision.number),
          },
        });
        await transaction.worksheetRecord.createMany({
          data: worksheetRows(workbook),
        });
        const cells = [...workbook.revision.cells.values()].map((cell) =>
          cellRow(workbook.id, cell),
        );
        if (cells.length > 0) {
          await transaction.cellRecord.createMany({ data: cells });
        }
      });
      return { kind: "created" };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002" &&
        (await client.workbookRecord.findUnique({
          where: { id: String(workbook.id) },
          select: { id: true },
        })) !== null
      ) {
        return { kind: "already-exists" };
      }
      throw error;
    }
  },

  find: (id) => findWorkbook(client, id),

  update: (workbook, expectedRevision) =>
    client.$transaction(async (transaction) => {
      // CAS を最初の書き込みにして expectedRevision を予約する。
      // 後続の Worksheet / Cell 更新も同じ Transaction なので、途中失敗時はすべて戻る。
      const update = await transaction.workbookRecord.updateMany({
        where: {
          id: String(workbook.id),
          currentRevision: Number(expectedRevision),
        },
        data: {
          name: String(workbook.name),
          currentRevision: Number(workbook.revision.number),
        },
      });
      if (update.count === 0) {
        const existing = await transaction.workbookRecord.findUnique({
          where: { id: String(workbook.id) },
          select: { id: true },
        });
        return existing === null
          ? ({ kind: "workbook-not-found" } as const)
          : ({ kind: "concurrent-write" } as const);
      }

      await persistWorksheetSnapshot(transaction, workbook);
      await persistModifiedCells(transaction, workbook);
      return { kind: "updated" } as const;
    }),

  delete: async (id) => {
    // deleteMany により、既に存在しない Workbook の削除も成功する冪等な CRUD とする。
    await client.workbookRecord.deleteMany({ where: { id: String(id) } });
  },
});
