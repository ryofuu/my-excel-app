import {
  Cell,
  Workbook,
  WorkbookRevision,
  Worksheet,
  cellId,
  parseA1Address,
  parseCellInput,
  revisionNumber,
  workbookId,
  workbookName,
  worksheetId,
  worksheetName,
  type CellId,
} from "@gridline/core/domain";

export const formulaLaboratoryWorkbookId = workbookId("gridline-formula-lab");
export const formulaLaboratoryWorksheetId = worksheetId("gridline-sheet-1");

const demoInputs: Readonly<Record<string, string>> = {
  A1: "Gridline — formula laboratory",
  A3: "Revenue",
  B3: "Cost",
  C3: "Margin",
  D3: "Margin %",
  A4: "1200",
  B4: "720",
  C4: "=A4-B4",
  D4: "=C4/A4",
  A5: "980",
  B5: "610",
  C5: "=A5-B5",
  D5: "=C5/A5",
  A6: "1440",
  B6: "850",
  C6: "=A6-B6",
  D6: "=C6/A6",
  A8: "Total",
  B8: "=SUM(B4:B6)",
  C8: "=SUM(C4:C6)",
  D8: "=C8/SUM(A4:A6)",
  F3: "Try these",
  F4: "=SUM(C4:C6)",
  F5: "=A4*2",
  F6: "=A4/0",
};

export const formulaLaboratorySeed = (): Workbook => {
  const worksheet = new Worksheet({
    id: formulaLaboratoryWorksheetId,
    name: worksheetName("Sheet1"),
  });
  const cells = new Map<CellId, Cell>();
  for (const [address, input] of Object.entries(demoInputs)) {
    const content = parseCellInput(input);
    if (content === null) {
      continue;
    }
    const id = cellId(formulaLaboratoryWorksheetId, parseA1Address(address));
    cells.set(
      id,
      new Cell({ id, content, modifiedRevision: revisionNumber(0) }),
    );
  }
  const revision = new WorkbookRevision({
    number: revisionNumber(0),
    worksheets: [worksheet],
    cells,
  });
  return new Workbook({
    id: formulaLaboratoryWorkbookId,
    name: workbookName("Formula laboratory"),
    revision,
  });
};
