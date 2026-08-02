import type {
  WorksheetId,
  WorksheetName,
} from "../value-objects/identifiers.vo";

export type WorksheetProperties = Readonly<{
  id: WorksheetId;
  name: WorksheetName;
}>;

/** 安定した識別子と、変更可能な表示名を組にした Worksheet。 */
export class Worksheet {
  public readonly id: WorksheetId;
  public readonly name: WorksheetName;

  public constructor(properties: WorksheetProperties) {
    this.id = properties.id;
    this.name = properties.name;
  }
}
