import type { CellId } from "../../value-objects/cell-address.vo";
import {
  cellContentEquals,
  type CellContent,
} from "../../value-objects/cell-content.vo";
import {
  errorValue,
  literalValue,
  type CellValue,
} from "../../value-objects/cell-value.vo";
import type { WorkbookRevision } from "../../entities/workbook-revision.entity";
import type { Workbook } from "../../entities/workbook.entity";
import {
  calculationSnapshot,
  type CalculationSnapshot,
  type PreviousCalculation,
} from "../../derived/calculation/calculation-snapshot.derived";
import { calculationTrace } from "../../derived/calculation/calculation-trace.derived";
import type {
  CompiledRevision,
  FormulaAdjacency,
} from "../../derived/calculation/dependency-graph.derived";
import { collectDirtyCellIds } from "./graph/collect-dirty-cell-ids.service";
import { compileRevision } from "./graph/compile-revision.service";
import { createFormulaAdjacency } from "./graph/create-formula-adjacency.service";
import { detectCircularReferences } from "./graph/detect-circular-references.service";
import { topologicallySortFormulas } from "./graph/topologically-sort-formulas.service";
import { evaluateFormula } from "./formula/evaluate-formula.service";

const contentAt = (revision: WorkbookRevision, id: CellId): CellContent | null =>
  revision.cells.get(id)?.content ?? null;

const changedCellIds = (previous: WorkbookRevision, next: WorkbookRevision): readonly CellId[] => {
  const ids = new Set<CellId>([...previous.cells.keys(), ...next.cells.keys()]);
  return [...ids]
    .filter((id) => !cellContentEquals(contentAt(previous, id), contentAt(next, id)))
    .sort();
};

const allContentCellIds = (revision: WorkbookRevision): readonly CellId[] =>
  [...revision.cells]
    .filter(([, cell]) => cell.content !== null)
    .map(([id]) => id)
    .sort();

const excludeFormulaIds = (
  adjacency: FormulaAdjacency,
  excluded: ReadonlySet<CellId>,
): FormulaAdjacency => {
  const remaining = new Map<CellId, readonly CellId[]>();
  for (const [formulaId, precedents] of adjacency) {
    if (!excluded.has(formulaId)) {
      remaining.set(
        formulaId,
        precedents.filter((precedent) => !excluded.has(precedent)),
      );
    }
  }
  return remaining;
};

const assignDirectInputValues = (
  revision: WorkbookRevision,
  values: Map<CellId, CellValue>,
  changed: readonly CellId[],
  full: boolean,
): void => {
  const targetIds = full ? allContentCellIds(revision) : changed;
  for (const id of targetIds) {
    const content = contentAt(revision, id);
    if (content === null) {
      values.delete(id);
    } else if (content.kind === "literal") {
      values.set(id, literalValue(content.literal));
    } else {
      // Formula は後続の依存順評価で入れ直すため、過去の計算値を先に捨てる。
      values.delete(id);
    }
  }
};

const fullRecalculation = (
  workbook: Workbook,
  previous?: PreviousCalculation,
): boolean =>
  previous === undefined ||
  previous.workbook.id !== workbook.id ||
  previous.snapshot.sourceRevision !== previous.workbook.revision.number;

/**
 * 1つの不変な WorkbookRevision を再計算する。
 * 前回状態があれば未変更値を再利用しつつ、変更 Cell の全依存先を再計算対象にする。
 */
export const recalculate = (
  workbook: Workbook,
  previous?: PreviousCalculation,
): CalculationSnapshot => {
  const revision = workbook.revision;
  // Formula の解析結果と依存グラフを先に構築し、値の評価順をデータ構造として確定する。
  const compiled: CompiledRevision = compileRevision(revision);
  const full = fullRecalculation(workbook, previous);
  const changed =
    full || previous === undefined
      ? allContentCellIds(revision)
      : changedCellIds(previous.workbook.revision, revision);
  const dirtyCellIds = full
    ? changed
    : collectDirtyCellIds(
        changed,
        previous === undefined
          ? [compiled.graph]
          : [compiled.graph, previous.snapshot.graph],
      );
  // 依存関係が変わった Formula も拾えるように、現在と前回の両グラフから dirty を伝播する。
  const dirtyFormulaIds = new Set(
    dirtyCellIds.filter((id) => compiled.formulas.has(id)),
  );
  const values = new Map<CellId, CellValue>(full ? [] : previous?.snapshot.values ?? []);
  assignDirectInputValues(revision, values, changed, full);

  const adjacency = createFormulaAdjacency(dirtyFormulaIds, compiled.formulas);
  // 循環成分を先にエラーへ確定し、残りだけを依存元から依存先の順に評価する。
  const cycles = detectCircularReferences(adjacency);
  const cyclicFormulaIds = new Set<CellId>(cycles.flat());
  const evaluableAdjacency = excludeFormulaIds(adjacency, cyclicFormulaIds);
  const evaluationOrder: CellId[] = [];

  for (const component of cycles) {
    for (const formulaId of component) {
      values.set(
        formulaId,
        errorValue("circular-reference", formulaId, "Formula participates in a circular reference."),
      );
      evaluationOrder.push(formulaId);
    }
  }

  for (const formulaId of topologicallySortFormulas(evaluableAdjacency)) {
    const formula = compiled.formulas.get(formulaId);
    if (formula === undefined) {
      continue;
    }
    values.set(formulaId, evaluateFormula(formula, values));
    evaluationOrder.push(formulaId);
  }

  // 計算結果は正本へ書き戻さず、元 Revision を指す派生 Snapshot として返す。
  return calculationSnapshot({
    sourceRevision: revision.number,
    values,
    formulas: compiled.formulas,
    graph: compiled.graph,
    trace: calculationTrace({
      dirtyCellIds,
      evaluationOrder,
      cycles,
    }),
  });
};
