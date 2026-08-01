import { describe, expect, it } from "vitest";
import {
  Cell,
  WorkbookRevision,
  Worksheet,
  cellAddress,
  cellId,
  compileRevision,
  dependentsOf,
  formulaSource,
  parseA1Address,
  parseCellInput,
  parseFormula,
  recalculate,
  revisionNumber,
  translateFormula,
  valueInSnapshot,
  workbookId,
  worksheetId,
  worksheetName,
  type CellContent,
  type CellId,
  type WorkbookRevision as WorkbookRevisionType,
} from "../../index";

const ids = {
  workbook: workbookId("workbook-1"),
  worksheet: worksheetId("worksheet-1"),
};

const worksheet = new Worksheet({ id: ids.worksheet, name: worksheetName("Sheet1") });

const idFor = (address: string): CellId => cellId(ids.worksheet, parseA1Address(address));

const revision = (
  number: number,
  inputs: Readonly<Record<string, string | CellContent | null>>,
): WorkbookRevisionType => {
  const cells = new Map<CellId, Cell>();
  for (const [address, input] of Object.entries(inputs)) {
    const content = typeof input === "string" ? parseCellInput(input) : input;
    const id = idFor(address);
    cells.set(id, new Cell({ id, content, modifiedRevision: revisionNumber(number) }));
  }
  return new WorkbookRevision({
    workbookId: ids.workbook,
    number: revisionNumber(number),
    worksheets: [worksheet],
    cells,
  });
};

const value = (snapshot: ReturnType<typeof recalculate>, address: string) =>
  valueInSnapshot(snapshot, idFor(address));

describe("formula parser", () => {
  it("preserves tokens and parses A1, anchors, ranges, precedence, and SUM", () => {
    const source = formulaSource('=SUM(A1:$B2, 3*-(C3-1))&"!"');
    const result = parseFormula(source);

    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      return;
    }
    expect(result.tokens.filter((token) => token.kind === "reference").map((token) => token.lexeme)).toEqual([
      "A1",
      "$B2",
      "C3",
    ]);
    expect(result.expression.kind).toBe("binary");
  });

  it("keeps a malformed FormulaSource parseable as source text", () => {
    const result = parseFormula(formulaSource("=1+"));
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.error.message).toContain("Expected an expression");
    }
  });

  it("translates only relative coordinates when a formula is copied", () => {
    const translated = translateFormula(
      formulaSource("=A1+$B2+C$3+$D$4"),
      cellAddress(1, 1),
      cellAddress(3, 4),
    );
    expect(translated).toEqual({ kind: "success", source: "=D3+$B4+F$3+$D$4" });
  });
});

describe("calculation integration", () => {
  it("evaluates a dependency chain and keeps range edges symbolic", () => {
    const source = revision(0, {
      A1: "2",
      A2: "3",
      B1: "=A1+A2",
      C1: "=SUM(A1:B1)",
    });
    const snapshot = recalculate(source);

    expect(value(snapshot, "B1")).toEqual({ kind: "number", value: 5 });
    expect(value(snapshot, "C1")).toEqual({ kind: "number", value: 7 });
    expect(snapshot.trace.evaluationOrder).toEqual([idFor("B1"), idFor("C1")]);

    const compiled = compileRevision(source);
    expect(compiled.graph.rangeDependents).toHaveLength(1);
    expect(compiled.graph.directDependentsByCell.has(idFor("A2"))).toBe(true);
    expect(dependentsOf(compiled.graph, idFor("A1"))).toEqual([idFor("B1"), idFor("C1")]);
  });

  it("marks transitive dependents dirty even when an edited formula keeps the same value", () => {
    const first = revision(0, {
      A1: "=1+1",
      B1: "=A1*3",
      C1: "=B1+1",
    });
    const firstSnapshot = recalculate(first);
    const second = revision(1, {
      A1: "=2",
      B1: "=A1*3",
      C1: "=B1+1",
    });
    const secondSnapshot = recalculate(second, { revision: first, snapshot: firstSnapshot });

    expect(value(secondSnapshot, "C1")).toEqual({ kind: "number", value: 7 });
    expect(secondSnapshot.trace.dirtyCellIds).toEqual([idFor("A1"), idFor("B1"), idFor("C1")]);
    expect(secondSnapshot.trace.evaluationOrder).toEqual([idFor("A1"), idFor("B1"), idFor("C1")]);
  });

  it("evaluates only affected formulas after a literal edit", () => {
    const first = revision(0, {
      A1: "2",
      B1: "=A1+1",
      C1: "=B1*2",
      D1: "=10+1",
    });
    const firstSnapshot = recalculate(first);
    const second = revision(1, {
      A1: "4",
      B1: "=A1+1",
      C1: "=B1*2",
      D1: "=10+1",
    });
    const secondSnapshot = recalculate(second, { revision: first, snapshot: firstSnapshot });

    expect(value(secondSnapshot, "C1")).toEqual({ kind: "number", value: 10 });
    expect(value(secondSnapshot, "D1")).toEqual({ kind: "number", value: 11 });
    expect(secondSnapshot.trace.dirtyCellIds).toEqual([idFor("A1"), idFor("B1"), idFor("C1")]);
    expect(secondSnapshot.trace.evaluationOrder).toEqual([idFor("B1"), idFor("C1")]);
  });

  it("uses a symbolic range dependency to invalidate a SUM when one member changes", () => {
    const first = revision(0, {
      A1: "1",
      A2: "2",
      B1: "=SUM(A1:A2)",
      C1: "=B1*2",
    });
    const firstSnapshot = recalculate(first);
    const second = revision(1, {
      A1: "1",
      A2: "5",
      B1: "=SUM(A1:A2)",
      C1: "=B1*2",
    });
    const secondSnapshot = recalculate(second, { revision: first, snapshot: firstSnapshot });

    expect(value(secondSnapshot, "B1")).toEqual({ kind: "number", value: 6 });
    expect(value(secondSnapshot, "C1")).toEqual({ kind: "number", value: 12 });
    expect(secondSnapshot.trace.dirtyCellIds).toEqual([idFor("A2"), idFor("B1"), idFor("C1")]);
  });

  it("detects cycles, preserves the origin while propagating its error, and leaves no stale value", () => {
    const source = revision(0, {
      A1: "=B1+1",
      B1: "=A1+1",
      C1: "=A1+1",
    });
    const snapshot = recalculate(source);

    expect(snapshot.trace.cycles).toEqual([[idFor("A1"), idFor("B1")]]);
    expect(value(snapshot, "A1")).toMatchObject({ kind: "error", code: "circular-reference", origin: idFor("A1") });
    expect(value(snapshot, "B1")).toMatchObject({ kind: "error", code: "circular-reference", origin: idFor("B1") });
    expect(value(snapshot, "C1")).toMatchObject({ kind: "error", code: "circular-reference", origin: idFor("A1") });
  });

  it("returns a parse error without losing the raw source", () => {
    const source = revision(0, { A1: "=1+" });
    const snapshot = recalculate(source);

    expect(source.cells.get(idFor("A1"))?.content).toEqual({ kind: "formula", source: "=1+" });
    expect(value(snapshot, "A1")).toMatchObject({ kind: "error", code: "parse", origin: idFor("A1") });
  });

  it("uses strict scalar types while SUM ignores blanks and propagates errors", () => {
    const source = revision(0, {
      A1: "2",
      A2: "",
      A3: "3",
      B1: "=SUM(A1:A3, 4)",
      B2: "=A1+TRUE",
      B3: "=1/0",
      C1: "=B3+1",
    });
    const snapshot = recalculate(source);

    expect(value(snapshot, "B1")).toEqual({ kind: "number", value: 9 });
    expect(value(snapshot, "B2")).toMatchObject({ kind: "error", code: "type", origin: idFor("B2") });
    expect(value(snapshot, "B3")).toMatchObject({ kind: "error", code: "division-by-zero", origin: idFor("B3") });
    expect(value(snapshot, "C1")).toMatchObject({ kind: "error", code: "division-by-zero", origin: idFor("B3") });
  });

  it("evaluates unary, concat, and comparison operators with their declared types", () => {
    const source = revision(0, {
      A1: "left",
      A2: "2",
      B1: '=A1&"!"',
      B2: "=-A2",
      C1: "=2<3",
      C2: "=3>=3",
      D1: "=4<>5",
      D2: "=5=5",
    });
    const snapshot = recalculate(source);

    expect(value(snapshot, "B1")).toEqual({ kind: "text", value: "left!" });
    expect(value(snapshot, "B2")).toEqual({ kind: "number", value: -2 });
    expect(value(snapshot, "C1")).toEqual({ kind: "boolean", value: true });
    expect(value(snapshot, "C2")).toEqual({ kind: "boolean", value: true });
    expect(value(snapshot, "D1")).toEqual({ kind: "boolean", value: true });
    expect(value(snapshot, "D2")).toEqual({ kind: "boolean", value: true });
  });
});
