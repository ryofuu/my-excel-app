import { cellIdParts, type CellId } from "../value-objects/cell-address";
import type {
  RevisionNumber,
  WorkbookId,
  WorksheetId,
  WorksheetName,
} from "../value-objects/identifiers";
import { Cell } from "./cell";
import { Worksheet } from "./worksheet";

export type WorkbookRevisionProperties = Readonly<{
  workbookId: WorkbookId;
  number: RevisionNumber;
  worksheets: readonly Worksheet[];
  cells: ReadonlyMap<CellId, Cell>;
}>;

/**
 * The complete input state used by one calculation. This entity contains only
 * worksheet order and raw cell content; calculated values belong to a snapshot.
 */
export class WorkbookRevision {
  public readonly workbookId: WorkbookId;
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
      if (!worksheetIds.has(cellIdParts(id).worksheetId)) {
        throw new Error(`Cell ${id} belongs to a Worksheet absent from this revision.`);
      }
    }

    this.workbookId = properties.workbookId;
    this.number = properties.number;
    this.worksheets = Object.freeze([...properties.worksheets]);
    this.cells = new Map(properties.cells);
  }
}
