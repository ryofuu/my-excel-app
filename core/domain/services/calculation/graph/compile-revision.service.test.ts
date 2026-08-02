import { describe, expect, it } from "vitest";

import {
  Cell,
  WorkbookRevision,
  Worksheet,
  cellId,
  compileRevision,
  parseA1Address,
  parseCellInput,
  revisionNumber,
  worksheetId,
  worksheetName,
  type CellId,
} from "../../../index";

const worksheet = new Worksheet({
  id: worksheetId("worksheet-1"),
  name: worksheetName("Sheet1"),
});

const idFor = (address: string): CellId =>
  cellId(worksheet.id, parseA1Address(address));

const revisionWith = (
  inputs: Readonly<Record<string, string | null>>,
): WorkbookRevision =>
  new WorkbookRevision({
    number: revisionNumber(0),
    worksheets: [worksheet],
    cells: new Map(
      Object.entries(inputs).map(([address, input]) => {
        const id = idFor(address);
        return [
          id,
          new Cell({
            id,
            content: input === null ? null : parseCellInput(input),
            modifiedRevision: revisionNumber(0),
          }),
        ];
      }),
    ),
  });

describe("WorkbookRevisionのCompile", () => {
  it("Formula CellだけをCompileしてPrecedentとDependentのGraphを構築する", () => {
    const compiled = compileRevision(
      revisionWith({
        A1: "10",
        B1: "=A1+A1",
        C1: "=A1",
        D1: "=SUM(B1:A1)",
        E1: "=1+",
        F1: null,
      }),
    );

    expect([...compiled.formulas.keys()].sort()).toEqual([
      idFor("B1"),
      idFor("C1"),
      idFor("D1"),
      idFor("E1"),
    ]);
    expect(compiled.graph.precedentsByCell.get(idFor("B1"))).toEqual([
      { kind: "cell", precedent: idFor("A1") },
    ]);
    expect(compiled.graph.precedentsByCell.get(idFor("C1"))).toEqual([
      { kind: "cell", precedent: idFor("A1") },
    ]);
    expect(compiled.graph.precedentsByCell.get(idFor("D1"))).toEqual([
      {
        kind: "range",
        worksheetId: worksheet.id,
        start: parseA1Address("A1"),
        end: parseA1Address("B1"),
      },
    ]);
    expect(compiled.graph.precedentsByCell.get(idFor("E1"))).toEqual([]);
    expect(compiled.graph.directDependentsByCell).toEqual(
      new Map([[idFor("A1"), [idFor("B1"), idFor("C1")]]]),
    );
    expect(compiled.graph.rangeDependents).toEqual([
      {
        range: {
          kind: "range",
          worksheetId: worksheet.id,
          start: parseA1Address("A1"),
          end: parseA1Address("B1"),
        },
        dependent: idFor("D1"),
      },
    ]);
  });
});
