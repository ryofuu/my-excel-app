import type {
  WorksheetId,
  WorksheetName,
} from "../value-objects/identifiers.vo";

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
