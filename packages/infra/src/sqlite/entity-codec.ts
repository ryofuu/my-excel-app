import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellIdParts,
  revisionNumber,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
  type CellContent,
  type CellId,
  type WorkbookChangeSet,
} from "@gridline/domain";
import type { WorkbookSeed } from "@gridline/usecases";

import type {
  CellStateDto,
  WorkbookChangeSetDto,
  WorkbookDto,
  WorkbookRevisionDto,
  WorkbookSeedDto,
} from "./dto";

const toCellStateDto = (cell: Cell): CellStateDto => {
  const id = String(cell.id);
  const parts = cellIdParts(cell.id);
  return {
    cellId: id,
    worksheetId: String(parts.worksheetId),
    row: Number(parts.address.row),
    column: Number(parts.address.column),
    content: cell.content as CellContent | null,
    modifiedRevision: Number(cell.modifiedRevision),
  };
};

export const toWorkbookDto = (workbook: Workbook): WorkbookDto => ({
  id: String(workbook.id),
  name: String(workbook.name),
  currentRevision: Number(workbook.currentRevision),
});

export const fromWorkbookDto = (dto: WorkbookDto): Workbook =>
  new Workbook({
    id: workbookId(dto.id),
    name: workbookName(dto.name),
    currentRevision: revisionNumber(dto.currentRevision),
  });

export const toWorkbookRevisionDto = (
  revision: WorkbookRevision,
): WorkbookRevisionDto => ({
  workbookId: String(revision.workbookId),
  number: Number(revision.number),
  worksheets: revision.worksheets.map((worksheet, position) => ({
    id: String(worksheet.id),
    name: String(worksheet.name),
    position,
  })),
  cells: [...revision.cells.values()].map(toCellStateDto),
});

export const fromWorkbookRevisionDto = (
  dto: WorkbookRevisionDto,
): WorkbookRevision => {
  const worksheets = dto.worksheets
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(
      (worksheet) =>
        new Worksheet({
          id: worksheetId(worksheet.id),
          name: worksheetName(worksheet.name),
        }),
    );
  const cells = new Map<CellId, Cell>(
    dto.cells.map((cell) => [
      cell.cellId as CellId,
      new Cell({
        id: cell.cellId as CellId,
        content: cell.content as CellContent,
        modifiedRevision: revisionNumber(cell.modifiedRevision),
      }),
    ]),
  );
  return new WorkbookRevision({
    workbookId: workbookId(dto.workbookId),
    number: revisionNumber(dto.number),
    worksheets,
    cells,
  });
};

export const toWorkbookSeedDto = (seed: WorkbookSeed): WorkbookSeedDto => ({
  workbook: toWorkbookDto(seed.workbook),
  revision: toWorkbookRevisionDto(seed.revision),
});

export const toWorkbookChangeSetDto = (
  changeSet: WorkbookChangeSet,
): WorkbookChangeSetDto => ({
  workbookId: String(changeSet.workbookId),
  baseRevision: Number(changeSet.baseRevision),
  cellChanges: changeSet.cellChanges.map((change) => {
    const parts = cellIdParts(change.cellId);
    return {
      cellId: String(change.cellId),
      worksheetId: String(parts.worksheetId),
      row: Number(parts.address.row),
      column: Number(parts.address.column),
      content: change.content as CellContent | null,
      // The storage transaction owns the target revision number.
      modifiedRevision: -1,
    };
  }),
});
