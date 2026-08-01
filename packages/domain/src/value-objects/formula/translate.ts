import { cellAddress, type CellAddress } from "../cell-address";
import { formulaSource, type FormulaSource } from "../cell-content";
import { formatCellReference } from "./ast";
import { tokenizeFormula } from "./token";

export type FormulaTranslation =
  | Readonly<{ kind: "success"; source: FormulaSource }>
  | Readonly<{ kind: "error"; source: FormulaSource | string; message: string }>;

/**
 * Applies a paste offset to relative A1 coordinates while retaining $ anchors.
 * The source is not modified when the offset would leave the supported grid.
 */
export const translateFormula = (
  source: FormulaSource | string,
  fromAddress: CellAddress,
  toAddress: CellAddress,
): FormulaTranslation => {
  const offset = {
    rows: toAddress.row - fromAddress.row,
    columns: toAddress.column - fromAddress.column,
  };
  if (!Number.isSafeInteger(offset.rows) || !Number.isSafeInteger(offset.columns)) {
    return { kind: "error", source, message: "Formula translation offsets must be safe integers." };
  }

  const tokens = tokenizeFormula(source);
  const references = tokens.filter((token) => token.kind === "reference");
  let translated = "";
  let position = 0;
  try {
    for (const token of references) {
      const row = token.reference.address.row + (token.reference.rowAbsolute ? 0 : offset.rows);
      const column = token.reference.address.column + (token.reference.columnAbsolute ? 0 : offset.columns);
      const replacement = formatCellReference({
        ...token.reference,
        address: cellAddress(row, column),
      });
      translated += source.slice(position, token.start) + replacement;
      position = token.end;
    }
  } catch (error) {
    return {
      kind: "error",
      source,
      message: error instanceof Error ? error.message : "Formula reference left the supported grid.",
    };
  }

  translated += source.slice(position);
  return { kind: "success", source: formulaSource(translated) };
};
