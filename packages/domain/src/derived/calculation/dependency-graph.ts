import type { CellAddress, CellId } from "../../value-objects/cell-address";
import type { FormulaSource } from "../../value-objects/cell-content";
import type { WorksheetId } from "../../value-objects/identifiers";
import type { FormulaParseResult } from "../../value-objects/formula/parse";

export type CellDependency = Readonly<{
  kind: "cell";
  precedent: CellId;
}>;

/** A range stays symbolic in the graph instead of being expanded into cells. */
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

/** Parsed source and symbolic precedents derived from one formula cell. */
export type FormulaAnalysis = Readonly<{
  cellId: CellId;
  source: FormulaSource;
  parse: FormulaParseResult;
  dependencies: readonly Dependency[];
}>;

export type DependencyGraph = Readonly<{
  precedentsByCell: ReadonlyMap<CellId, readonly Dependency[]>;
  directDependentsByCell: ReadonlyMap<CellId, readonly CellId[]>;
  rangeDependents: readonly RangeDependent[];
}>;

/** The compiled, non-persistent calculation metadata for a WorkbookRevision. */
export type CompiledRevision = Readonly<{
  formulas: ReadonlyMap<CellId, FormulaAnalysis>;
  graph: DependencyGraph;
}>;
