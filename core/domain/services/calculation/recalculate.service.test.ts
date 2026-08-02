import { describe, expect, it } from "vitest";
import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  compileRevision,
  dependentsOf,
  parseCellInput,
  recalculate,
  revisionNumber,
  valueInSnapshot,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
  type CellContent,
  type CellId,
  type Workbook as WorkbookType,
} from "../../index";
import { createCellIdFor } from "./calculation.test-helper";

const ids = {
  workbook: workbookId("workbook-1"),
  worksheet: worksheetId("worksheet-1"),
};

const worksheet = new Worksheet({ id: ids.worksheet, name: worksheetName("Sheet1") });

const idFor = createCellIdFor(ids.worksheet);

const revision = (
  number: number,
  inputs: Readonly<Record<string, string | CellContent | null>>,
): WorkbookType => {
  const cells = new Map<CellId, Cell>();
  for (const [address, input] of Object.entries(inputs)) {
    const content = typeof input === "string" ? parseCellInput(input) : input;
    const id = idFor(address);
    cells.set(id, new Cell({ id, content, modifiedRevision: revisionNumber(number) }));
  }
  return new Workbook({
    id: ids.workbook,
    name: workbookName("Test workbook"),
    revision: new WorkbookRevision({
      number: revisionNumber(number),
      worksheets: [worksheet],
      cells,
    }),
  });
};

const value = (snapshot: ReturnType<typeof recalculate>, address: string) =>
  valueInSnapshot(snapshot, idFor(address));

describe("Recalculationの統合", () => {
  it("依存関係を順に評価しRangeの依存関係を展開せずに保持する", () => {
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

    const compiled = compileRevision(source.revision);
    expect(compiled.graph.rangeDependents).toHaveLength(1);
    expect(compiled.graph.directDependentsByCell.has(idFor("A2"))).toBe(true);
    expect(dependentsOf(compiled.graph, idFor("A1"))).toEqual([idFor("B1"), idFor("C1")]);
  });

  it("Formulaの編集後も値が同じ場合に推移的なDependentをDirtyCellにする", () => {
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
    const secondSnapshot = recalculate(second, { workbook: first, snapshot: firstSnapshot });

    expect(value(secondSnapshot, "C1")).toEqual({ kind: "number", value: 7 });
    expect(secondSnapshot.trace.dirtyCellIds).toEqual([idFor("A1"), idFor("B1"), idFor("C1")]);
    expect(secondSnapshot.trace.evaluationOrder).toEqual([idFor("A1"), idFor("B1"), idFor("C1")]);
  });

  it("Literalの編集後は影響を受けるFormulaだけを評価する", () => {
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
    const secondSnapshot = recalculate(second, { workbook: first, snapshot: firstSnapshot });

    expect(value(secondSnapshot, "C1")).toEqual({ kind: "number", value: 10 });
    expect(value(secondSnapshot, "D1")).toEqual({ kind: "number", value: 11 });
    expect(secondSnapshot.trace.dirtyCellIds).toEqual([idFor("A1"), idFor("B1"), idFor("C1")]);
    expect(secondSnapshot.trace.evaluationOrder).toEqual([idFor("B1"), idFor("C1")]);
  });

  it("Range内のCellが変わると記号的な依存関係を使ってSUMを再評価する", () => {
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
    const secondSnapshot = recalculate(second, { workbook: first, snapshot: firstSnapshot });

    expect(value(secondSnapshot, "B1")).toEqual({ kind: "number", value: 6 });
    expect(value(secondSnapshot, "C1")).toEqual({ kind: "number", value: 12 });
    expect(secondSnapshot.trace.dirtyCellIds).toEqual([idFor("A2"), idFor("B1"), idFor("C1")]);
  });

  it("循環参照を検出しErrorの発生元を保って伝播させ古い値を残さない", () => {
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

  it("入力されたFormulaSourceを失わずにparse Errorを返す", () => {
    const source = revision(0, { A1: "=1+" });
    const snapshot = recalculate(source);

    expect(source.revision.cells.get(idFor("A1"))?.content).toEqual({ kind: "formula", source: "=1+" });
    expect(value(snapshot, "A1")).toMatchObject({ kind: "error", code: "parse", origin: idFor("A1") });
  });

  it("スカラー値の型を厳密に扱いSUMではBlankを無視してErrorを伝播させる", () => {
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

  it("単項・文字列結合・比較演算子を定義された型で評価する", () => {
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
