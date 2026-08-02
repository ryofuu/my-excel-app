import type {
  WorkbookId,
  WorkbookName,
} from "../value-objects/identifiers.vo";
import type { WorkbookRevision } from "./workbook-revision.entity";

export type WorkbookProperties = Readonly<{
  id: WorkbookId;
  name: WorkbookName;
  revision: WorkbookRevision;
}>;

/** 永続化対象の文書と現在の入力状態を束ねる Aggregate Root。 */
export class Workbook {
  public readonly id: WorkbookId;
  public readonly name: WorkbookName;
  public readonly revision: WorkbookRevision;

  public constructor(properties: WorkbookProperties) {
    this.id = properties.id;
    this.name = properties.name;
    this.revision = properties.revision;
  }
}
