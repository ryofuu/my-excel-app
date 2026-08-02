import { describe, expect, it } from "vitest";
import { cellAddress, formulaSource, translateFormula } from "../../index";

describe("Formulaのコピー変換", () => {
  it("コピー元と貼り付け先が同じCellならFormulaSourceを変更しない", () => {
    expect(
      translateFormula(formulaSource("=A1+$B$2"), cellAddress(3, 3), cellAddress(3, 3)),
    ).toEqual({ kind: "success", source: "=A1+$B$2" });
  });

  it("相対参照だけにコピー元から貼り付け先までの差分を適用する", () => {
    expect(
      translateFormula(
        formulaSource("=A1+$B2+C$3+$D$4"),
        cellAddress(1, 1),
        cellAddress(3, 4),
      ),
    ).toEqual({ kind: "success", source: "=D3+$B4+F$3+$D$4" });
  });

  it("CellReference以外の関数名・空白・Text Literalを再整形しない", () => {
    expect(
      translateFormula(
        formulaSource('=sum(A1, "A1") + $B2'),
        cellAddress(1, 1),
        cellAddress(3, 3),
      ),
    ).toEqual({ kind: "success", source: '=sum(C3, "A1") + $B4' });
  });

  it("構文が未完成でも保持されているFormulaSourceを失わない", () => {
    expect(
      translateFormula(formulaSource("=1+"), cellAddress(1, 1), cellAddress(2, 2)),
    ).toEqual({ kind: "success", source: "=1+" });
  });

  it("相対参照がWorksheetの上端または左端を越えるコピーを拒否する", () => {
    const source = formulaSource("=A1");

    expect(translateFormula(source, cellAddress(2, 2), cellAddress(1, 1))).toMatchObject({
      kind: "error",
      source,
      message: "RowNumber must be an integer from 1 to 1048576.",
    });
  });

  it("相対参照がWorksheetの下端または右端を越えるコピーを拒否する", () => {
    const source = formulaSource("=XFD1048576");

    expect(translateFormula(source, cellAddress(1, 1), cellAddress(2, 2))).toMatchObject({
      kind: "error",
      source,
      message: "RowNumber must be an integer from 1 to 1048576.",
    });
  });
});
