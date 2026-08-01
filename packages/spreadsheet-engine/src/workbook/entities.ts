import { cellIdParts, type CellId } from "../cell/address";
import type { CellContent } from "../cell/content";
import {
  type RevisionNumber,
  type WorkbookId,
  type WorkbookName,
  type WorksheetId,
  type WorksheetName,
} from "../identifiers";

export type WorkbookProperties = Readonly<{
  id: WorkbookId;
  name: WorkbookName;
  currentRevision: RevisionNumber;
}>;

/** The persisted document identity and metadata. */
export class Workbook {
  public readonly id: WorkbookId;
  public readonly name: WorkbookName;
  public readonly currentRevision: RevisionNumber;

  public constructor(properties: WorkbookProperties) {
    this.id = properties.id;
    this.name = properties.name;
    this.currentRevision = properties.currentRevision;
  }
}

export type WorksheetProperties = Readonly<{
  id: WorksheetId;
  name: WorksheetName;
}>;

/** A stable worksheet identity paired with its mutable display name. */
export class Worksheet {
  public readonly id: WorksheetId;
  public readonly name: WorksheetName;

  public constructor(properties: WorksheetProperties) {
    this.id = properties.id;
    this.name = properties.name;
  }
}

export type CellProperties = Readonly<{
  id: CellId;
  content: CellContent | null;
  modifiedRevision: RevisionNumber;
}>;

/** A sparse input cell. It deliberately does not contain a calculated value. */
export class Cell {
  public readonly id: CellId;
  public readonly content: CellContent | null;
  public readonly modifiedRevision: RevisionNumber;

  public constructor(properties: CellProperties) {
    this.id = properties.id;
    this.content = properties.content;
    this.modifiedRevision = properties.modifiedRevision;
  }
}

export type WorkbookRevisionProperties = Readonly<{
  workbookId: WorkbookId;
  number: RevisionNumber;
  worksheets: readonly Worksheet[];
  cells: ReadonlyMap<CellId, Cell>;
}>;

/**
 * The complete input state used by one calculation. This class contains only
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
    // Copying makes the entity own its view of the sparse input state. It is
    // exposed as ReadonlyMap so callers cannot rely on mutation.
    this.cells = new Map(properties.cells);
  }
}
