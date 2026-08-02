import { cellIdParts, type CellId } from "../value-objects/cell-address.vo";
import type {
  RevisionNumber,
  WorksheetId,
  WorksheetName,
} from "../value-objects/identifiers.vo";
import { Cell } from "./cell.entity";
import { Worksheet } from "./worksheet.entity";

export type WorkbookRevisionProperties = Readonly<{
  number: RevisionNumber;
  worksheets: readonly Worksheet[];
  cells: ReadonlyMap<CellId, Cell>;
}>;

/**
 * 1回の計算が参照する完全な入力状態。
 * Worksheet の順序と CellContent だけを持ち、計算値は派生 Snapshot に分離する。
 */
export class WorkbookRevision {
  public readonly number: RevisionNumber;
  public readonly worksheets: readonly Worksheet[];
  public readonly cells: ReadonlyMap<CellId, Cell>;

  public constructor(properties: WorkbookRevisionProperties) {
    if (properties.worksheets.length === 0) {
      throw new Error("WorkbookRevision must contain at least one Worksheet.");
    }

    const worksheetIds = new Set<WorksheetId>();
    const worksheetNames = new Set<WorksheetName>();
    for (const worksheet of properties.worksheets) {
      if (worksheetIds.has(worksheet.id)) {
        throw new Error(`WorkbookRevision contains duplicate WorksheetId: ${worksheet.id}`);
      }
      if (worksheetNames.has(worksheet.name)) {
        throw new Error(`WorkbookRevision contains duplicate WorksheetName: ${worksheet.name}`);
      }
      worksheetIds.add(worksheet.id);
      worksheetNames.add(worksheet.name);
    }

    for (const [id, cell] of properties.cells) {
      if (id !== cell.id) {
        throw new Error(`Cell map key and Cell.id must match: ${id}`);
      }
      if (cell.modifiedRevision > properties.number) {
        throw new Error(
          `Cell ${id} cannot be modified after WorkbookRevision ${properties.number}.`,
        );
      }
      if (!worksheetIds.has(cellIdParts(id).worksheetId)) {
        throw new Error(`Cell ${id} belongs to a Worksheet absent from this revision.`);
      }
    }

    this.number = properties.number;
    this.worksheets = Object.freeze([...properties.worksheets]);
    this.cells = new Map(properties.cells);
  }
}
