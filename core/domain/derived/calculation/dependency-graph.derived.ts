import type { CellAddress, CellId } from "../../value-objects/cell-address.vo";
import type { FormulaSource } from "../../value-objects/cell-content.vo";
import type { WorksheetId } from "../../value-objects/identifiers.vo";
import type { FormulaParseResult } from "../../value-objects/formula/formula.parser";
import type { FormulaToken } from "../../value-objects/formula/formula.tokenizer";

export type CellDependency = Readonly<{
  kind: "cell";
  precedent: CellId;
}>;

/** Range は Cell ごとに展開せず、依存グラフ内でも範囲のまま保持する。 */
export type RangeDependency = Readonly<{
  kind: "range";
  worksheetId: WorksheetId;
  start: CellAddress;
  end: CellAddress;
}>;

export type Dependency = CellDependency | RangeDependency;

export type RangeDependent = Readonly<{
  range: RangeDependency;
  dependent: CellId;
}>;

/** 1つの Formula Cell から導出した解析結果と記号的な参照元。 */
export type FormulaAnalysis = Readonly<{
  cellId: CellId;
  source: FormulaSource;
  tokens: readonly FormulaToken[];
  parse: FormulaParseResult;
  dependencies: readonly Dependency[];
}>;

export type DependencyGraph = Readonly<{
  precedentsByCell: ReadonlyMap<CellId, readonly Dependency[]>;
  directDependentsByCell: ReadonlyMap<CellId, readonly CellId[]>;
  rangeDependents: readonly RangeDependent[];
}>;

/** WorkbookRevision から構築した、永続化しない計算用 Metadata。 */
export type CompiledRevision = Readonly<{
  formulas: ReadonlyMap<CellId, FormulaAnalysis>;
  graph: DependencyGraph;
}>;
