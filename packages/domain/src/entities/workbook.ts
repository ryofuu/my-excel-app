import type {
  RevisionNumber,
  WorkbookId,
  WorkbookName,
} from "../value-objects/identifiers";

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
