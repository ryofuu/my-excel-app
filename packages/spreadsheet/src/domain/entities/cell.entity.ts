import type { CellId } from "../value-objects/cell-address.vo";
import type { CellContent } from "../value-objects/cell-content.vo";
import type { RevisionNumber } from "../value-objects/identifiers.vo";

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
