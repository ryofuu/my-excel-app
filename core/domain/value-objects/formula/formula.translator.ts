import { cellAddress, type CellAddress } from "../cell-address.vo";
import { formulaSource, type FormulaSource } from "../cell-content.vo";
import { formatCellReference } from "./formula.ast";
import type { FormulaToken } from "./formula.tokenizer";

export type FormulaTranslation =
  | Readonly<{ kind: "success"; source: FormulaSource }>
  | Readonly<{ kind: "error"; source: FormulaSource; message: string }>;

/**
 * `$` の絶対参照を維持しながら、相対 A1 参照へコピー位置の差分を適用する。
 * 参照先が対応範囲外になる場合は、元の FormulaSource を変更せず Error を返す。
 */
export const translateFormula = (
  source: FormulaSource,
  tokens: readonly FormulaToken[],
  fromAddress: CellAddress,
  toAddress: CellAddress,
): FormulaTranslation => {
  // Formula 内の各参照ではなく、コピー元からコピー先までの移動量を一度だけ求める。
  const offset = {
    rows: toAddress.row - fromAddress.row,
    columns: toAddress.column - fromAddress.column,
  };
  if (!Number.isSafeInteger(offset.rows) || !Number.isSafeInteger(offset.columns)) {
    return { kind: "error", source, message: "Formula translation offsets must be safe integers." };
  }

  // Token の位置情報を使い、CellReference 部分だけを置換する。
  // 関数名・演算子・空白・Text など、それ以外の Source 表現は元のまま残す。
  const references = tokens.filter((token) => token.kind === "reference");
  let translated = "";
  let position = 0;
  try {
    for (const token of references) {
      // `$` が付いた軸には Offset を適用せず、相対軸だけを移動する。
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
    // 1つでも参照が Grid 外へ出たら部分変換せず、呼び出し側が扱える Error にする。
    return {
      kind: "error",
      source,
      message: error instanceof Error ? error.message : "Formula reference left the supported grid.",
    };
  }

  translated += source.slice(position);
  return { kind: "success", source: formulaSource(translated) };
};
