import {
  cellId,
  parseA1Address,
  type CellId,
} from "../../value-objects/cell-address.vo";
import type { WorksheetId } from "../../value-objects/identifiers.vo";

export const createCellIdFor = (worksheetId: WorksheetId) =>
  (address: string): CellId => cellId(worksheetId, parseA1Address(address));
