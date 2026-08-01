import {
  cellId,
  cellIdParts,
  isAddressWithin,
  type CellAddress,
  type CellId,
} from "../../value-objects/cell-address.vo";
import { cellContentEquals, type CellContent } from "../../value-objects/cell-content.vo";
import {
  BLANK,
  errorValue,
  isErrorValue,
  literalValue,
  type CellError,
  type CellValue,
} from "../../value-objects/cell-value.vo";
import type { BinaryOperator, Expression } from "../../value-objects/formula/formula.ast";
import type { WorkbookRevision } from "../../entities/workbook-revision.entity";
import {
  calculationSnapshot,
  type CalculationSnapshot,
  type PreviousCalculation,
} from "../../derived/calculation/calculation-snapshot.derived";
import { calculationTrace } from "../../derived/calculation/calculation-trace.derived";
import type {
  CompiledRevision,
  Dependency,
  DependencyGraph,
  FormulaAnalysis,
  RangeDependency,
} from "../../derived/calculation/dependency-graph.derived";
import { compileRevision, dependentsOf } from "./compile-revision.service";

type RangeValue = Readonly<{
  kind: "range-value";
  range: RangeDependency;
}>;

type EvaluationResult = CellValue | RangeValue;

const contentAt = (revision: WorkbookRevision, id: CellId): CellContent | null =>
  revision.cells.get(id)?.content ?? null;

const valueAt = (values: ReadonlyMap<CellId, CellValue>, id: CellId): CellValue =>
  values.get(id) ?? BLANK;

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

const dirtyClosure = (
  changed: readonly CellId[],
  currentGraph: DependencyGraph,
  previousGraph?: DependencyGraph,
): readonly CellId[] => {
  const dirty = new Set<CellId>(changed);
  const queue = [...changed].sort();
  while (queue.length > 0) {
    const precedent = queue.shift();
    if (precedent === undefined) {
      continue;
    }
    const dependents = new Set<CellId>([
      ...dependentsOf(currentGraph, precedent),
      ...(previousGraph === undefined ? [] : dependentsOf(previousGraph, precedent)),
    ]);
    for (const dependent of [...dependents].sort()) {
      if (!dirty.has(dependent)) {
        dirty.add(dependent);
        queue.push(dependent);
      }
    }
  }
  return [...dirty].sort();
};

const formulaPrecedents = (
  formulaId: CellId,
  analysis: FormulaAnalysis,
  formulas: ReadonlyMap<CellId, FormulaAnalysis>,
): readonly CellId[] => {
  const result = new Set<CellId>();
  for (const dependency of analysis.dependencies) {
    if (dependency.kind === "cell") {
      if (formulas.has(dependency.precedent)) {
        result.add(dependency.precedent);
      }
      continue;
    }
    for (const candidate of formulas.keys()) {
      const { worksheetId, address } = cellIdParts(candidate);
      if (
        worksheetId === dependency.worksheetId &&
        isAddressWithin(address, dependency.start, dependency.end)
      ) {
        result.add(candidate);
      }
    }
  }
  // FormulaId only exists to make call sites explicit and is useful when
  // inspecting this code. A direct self-reference remains in the set.
  void formulaId;
  return [...result].sort();
};

type FormulaAdjacency = ReadonlyMap<CellId, readonly CellId[]>;

const formulaAdjacency = (
  dirtyFormulaIds: ReadonlySet<CellId>,
  formulas: ReadonlyMap<CellId, FormulaAnalysis>,
): FormulaAdjacency => {
  const adjacency = new Map<CellId, readonly CellId[]>();
  for (const id of [...dirtyFormulaIds].sort()) {
    const formula = formulas.get(id);
    if (formula === undefined) {
      continue;
    }
    adjacency.set(
      id,
      formulaPrecedents(id, formula, formulas).filter((precedent) => dirtyFormulaIds.has(precedent)),
    );
  }
  return adjacency;
};

/** Tarjan SCCs over dirty formula cells. */
const cycleComponents = (adjacency: FormulaAdjacency): readonly (readonly CellId[])[] => {
  let nextIndex = 0;
  const indices = new Map<CellId, number>();
  const lowLinks = new Map<CellId, number>();
  const stack: CellId[] = [];
  const onStack = new Set<CellId>();
  const components: CellId[][] = [];

  const visit = (node: CellId): void => {
    indices.set(node, nextIndex);
    lowLinks.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    onStack.add(node);

    for (const precedent of adjacency.get(node) ?? []) {
      if (!indices.has(precedent)) {
        visit(precedent);
        const ownLowLink = lowLinks.get(node);
        const precedentLowLink = lowLinks.get(precedent);
        if (ownLowLink !== undefined && precedentLowLink !== undefined) {
          lowLinks.set(node, Math.min(ownLowLink, precedentLowLink));
        }
      } else if (onStack.has(precedent)) {
        const ownLowLink = lowLinks.get(node);
        const precedentIndex = indices.get(precedent);
        if (ownLowLink !== undefined && precedentIndex !== undefined) {
          lowLinks.set(node, Math.min(ownLowLink, precedentIndex));
        }
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) {
      return;
    }

    const component: CellId[] = [];
    while (true) {
      const member = stack.pop();
      if (member === undefined) {
        break;
      }
      onStack.delete(member);
      component.push(member);
      if (member === node) {
        break;
      }
    }
    components.push(component.sort());
  };

  for (const node of [...adjacency.keys()].sort()) {
    if (!indices.has(node)) {
      visit(node);
    }
  }

  return components
    .filter((component) => {
      if (component.length > 1) {
        return true;
      }
      const node = component[0];
      return node !== undefined && (adjacency.get(node) ?? []).includes(node);
    })
    .sort((left, right) => (left[0] ?? "").localeCompare(right[0] ?? ""));
};

const topologicalOrder = (
  adjacency: FormulaAdjacency,
  cyclic: ReadonlySet<CellId>,
): readonly CellId[] => {
  const active = [...adjacency.keys()].filter((id) => !cyclic.has(id)).sort();
  const remainingPrecedents = new Map<CellId, number>();
  const dependents = new Map<CellId, Set<CellId>>();

  for (const formula of active) {
    const precedents = (adjacency.get(formula) ?? []).filter((id) => !cyclic.has(id));
    remainingPrecedents.set(formula, precedents.length);
    for (const precedent of precedents) {
      const list = dependents.get(precedent) ?? new Set<CellId>();
      list.add(formula);
      dependents.set(precedent, list);
    }
  }

  const ready = active.filter((id) => remainingPrecedents.get(id) === 0).sort();
  const result: CellId[] = [];
  while (ready.length > 0) {
    const formula = ready.shift();
    if (formula === undefined) {
      continue;
    }
    result.push(formula);
    for (const dependent of [...(dependents.get(formula) ?? [])].sort()) {
      const remaining = (remainingPrecedents.get(dependent) ?? 0) - 1;
      remainingPrecedents.set(dependent, remaining);
      if (remaining === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  return result;
};

const errorFromResult = (result: EvaluationResult): CellError | null =>
  result.kind === "range-value" ? null : isErrorValue(result) ? result : null;

const scalarNumber = (result: EvaluationResult, origin: CellId): number | CellError => {
  const error = errorFromResult(result);
  if (error !== null) {
    return error;
  }
  if (result.kind === "number") {
    return result.value;
  }
  return errorValue("type", origin, "This operation requires numeric operands.");
};

const scalarText = (result: EvaluationResult, origin: CellId): string | CellError => {
  const error = errorFromResult(result);
  if (error !== null) {
    return error;
  }
  if (result.kind === "text") {
    return result.value;
  }
  return errorValue("type", origin, "Text concatenation requires text operands.");
};

const compare = (left: CellValue, right: CellValue, operator: BinaryOperator, origin: CellId): CellValue => {
  if (isErrorValue(left)) {
    return left;
  }
  if (isErrorValue(right)) {
    return right;
  }
  if (left.kind === "blank" || right.kind === "blank" || left.kind !== right.kind) {
    return errorValue("type", origin, "Comparison requires two values of the same non-blank type.");
  }
  const ordering = left.value === right.value ? 0 : left.value < right.value ? -1 : 1;
  const value =
    operator === "="
      ? ordering === 0
      : operator === "<>"
        ? ordering !== 0
        : operator === "<"
          ? ordering < 0
          : operator === "<="
            ? ordering <= 0
            : operator === ">"
              ? ordering > 0
              : ordering >= 0;
  return { kind: "boolean", value };
};

const rangeValues = (
  range: RangeDependency,
  values: ReadonlyMap<CellId, CellValue>,
): readonly CellValue[] => {
  const valuesInRange: CellValue[] = [];
  for (const [id, value] of values) {
    const { worksheetId, address } = cellIdParts(id);
    if (worksheetId === range.worksheetId && isAddressWithin(address, range.start, range.end)) {
      valuesInRange.push(value);
    }
  }
  return valuesInRange;
};

const evaluateSum = (
  arguments_: readonly Expression[],
  ownerWorksheetId: ReturnType<typeof cellIdParts>["worksheetId"],
  owner: CellId,
  values: ReadonlyMap<CellId, CellValue>,
): CellValue => {
  let sum = 0;
  for (const argument of arguments_) {
    const result = evaluateExpression(argument, ownerWorksheetId, owner, values);
    const error = errorFromResult(result);
    if (error !== null) {
      return error;
    }
    const candidates = result.kind === "range-value" ? rangeValues(result.range, values) : [result];
    for (const value of candidates) {
      if (isErrorValue(value)) {
        return value;
      }
      if (value.kind === "blank") {
        continue;
      }
      if (value.kind !== "number") {
        return errorValue("type", owner, "SUM accepts numbers and blanks only.");
      }
      sum += value.value;
      if (!Number.isFinite(sum)) {
        return errorValue("type", owner, "SUM produced a numeric value outside the supported range.");
      }
    }
  }
  return { kind: "number", value: sum };
};

const evaluateExpression = (
  expression: Expression,
  ownerWorksheetId: ReturnType<typeof cellIdParts>["worksheetId"],
  owner: CellId,
  values: ReadonlyMap<CellId, CellValue>,
): EvaluationResult => {
  switch (expression.kind) {
    case "literal":
      return literalValue(expression.literal);
    case "reference":
      return valueAt(values, cellId(ownerWorksheetId, expression.reference.address));
    case "range":
      return {
        kind: "range-value",
        range: {
          kind: "range",
          worksheetId: ownerWorksheetId,
          start: {
            row: Math.min(expression.range.start.address.row, expression.range.end.address.row) as CellAddress["row"],
            column: Math.min(expression.range.start.address.column, expression.range.end.address.column) as CellAddress["column"],
          },
          end: {
            row: Math.max(expression.range.start.address.row, expression.range.end.address.row) as CellAddress["row"],
            column: Math.max(expression.range.start.address.column, expression.range.end.address.column) as CellAddress["column"],
          },
        },
      };
    case "unary": {
      const operand = scalarNumber(evaluateExpression(expression.operand, ownerWorksheetId, owner, values), owner);
      if (typeof operand !== "number") {
        return operand;
      }
      return { kind: "number", value: expression.operator === "-" ? -operand : operand };
    }
    case "binary": {
      const left = evaluateExpression(expression.left, ownerWorksheetId, owner, values);
      const leftError = errorFromResult(left);
      if (leftError !== null) {
        return leftError;
      }
      const right = evaluateExpression(expression.right, ownerWorksheetId, owner, values);
      const rightError = errorFromResult(right);
      if (rightError !== null) {
        return rightError;
      }
      if (["=", "<>", "<", "<=", ">", ">="].includes(expression.operator)) {
        if (left.kind === "range-value" || right.kind === "range-value") {
          return errorValue("type", owner, "A range cannot be used as a scalar comparison.");
        }
        return compare(left, right, expression.operator, owner);
      }
      if (expression.operator === "&") {
        const leftText = scalarText(left, owner);
        if (typeof leftText !== "string") {
          return leftText;
        }
        const rightText = scalarText(right, owner);
        if (typeof rightText !== "string") {
          return rightText;
        }
        return { kind: "text", value: leftText + rightText };
      }
      const leftNumber = scalarNumber(left, owner);
      if (typeof leftNumber !== "number") {
        return leftNumber;
      }
      const rightNumber = scalarNumber(right, owner);
      if (typeof rightNumber !== "number") {
        return rightNumber;
      }
      if (expression.operator === "/" && rightNumber === 0) {
        return errorValue("division-by-zero", owner, "Division by zero.");
      }
      const value =
        expression.operator === "+"
          ? leftNumber + rightNumber
          : expression.operator === "-"
            ? leftNumber - rightNumber
            : expression.operator === "*"
              ? leftNumber * rightNumber
              : leftNumber / rightNumber;
      if (!Number.isFinite(value)) {
        return errorValue("type", owner, "This operation produced a numeric value outside the supported range.");
      }
      return { kind: "number", value };
    }
    case "call":
      if (expression.name === "SUM") {
        return evaluateSum(expression.arguments, ownerWorksheetId, owner, values);
      }
      return errorValue("unknown-function", owner, `Unknown function: ${expression.name}.`);
  }
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
      // Never let an old formula value leak into the current evaluation.
      values.delete(id);
    }
  }
};

const fullRecalculation = (
  revision: WorkbookRevision,
  previous?: PreviousCalculation,
): boolean =>
  previous === undefined ||
  previous.revision.workbookId !== revision.workbookId ||
  previous.snapshot.sourceRevision !== previous.revision.number;

/**
 * Recalculates one immutable WorkbookRevision. Passing the previous pair lets
 * the engine reuse unchanged values while still marking every transitive
 * Dependent dirty, even when a value happens to remain equal.
 */
export const recalculate = (
  revision: WorkbookRevision,
  previous?: PreviousCalculation,
): CalculationSnapshot => {
  const compiled: CompiledRevision = compileRevision(revision);
  const full = fullRecalculation(revision, previous);
  const changed =
    full || previous === undefined
      ? allContentCellIds(revision)
      : changedCellIds(previous.revision, revision);
  const dirtyCellIds = full
    ? changed
    : dirtyClosure(changed, compiled.graph, previous?.snapshot.graph);
  const dirtyFormulaIds = new Set(
    dirtyCellIds.filter((id) => compiled.formulas.has(id)),
  );
  const values = new Map<CellId, CellValue>(full ? [] : previous?.snapshot.values ?? []);
  assignDirectInputValues(revision, values, changed, full);

  const adjacency = formulaAdjacency(dirtyFormulaIds, compiled.formulas);
  const cycles = cycleComponents(adjacency);
  const cyclicFormulaIds = new Set<CellId>(cycles.flat());
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

  for (const formulaId of topologicalOrder(adjacency, cyclicFormulaIds)) {
    const formula = compiled.formulas.get(formulaId);
    if (formula === undefined) {
      continue;
    }
    if (formula.parse.kind === "error") {
      values.set(formulaId, errorValue("parse", formulaId, formula.parse.error.message));
    } else {
      const worksheetId = cellIdParts(formulaId).worksheetId;
      const evaluated = evaluateExpression(formula.parse.expression, worksheetId, formulaId, values);
      if (evaluated.kind === "range-value") {
        values.set(formulaId, errorValue("type", formulaId, "A range cannot be used as a cell value."));
      } else {
        values.set(formulaId, evaluated);
      }
    }
    evaluationOrder.push(formulaId);
  }

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
