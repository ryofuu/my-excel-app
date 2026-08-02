import {
  cellId,
  formulaContent,
  translateFormula,
  type CellChange,
  type Workbook,
  type WorksheetId,
} from "@gridline/core/domain";

import type { CreateWorkbookRevisionCommand } from "./spreadsheet-client.port";

export const cellChangesFromCommand = (
  workbook: Workbook,
  worksheetId: WorksheetId,
  command: CreateWorkbookRevisionCommand,
): readonly CellChange[] => {
  if (command.kind === "set-cell-contents") {
    // Presentation 境界で検証済みの Address / CellContent に、対象 Worksheet だけを結合する。
    return command.changes.map((change) => ({
      cellId: cellId(worksheetId, change.address),
      content: change.content,
    }));
  }

  return command.copies.map((copy) => {
    // 内部コピーは生文字列を再解釈せず、現在の CellContent をコピー元にする。
    const sourceId = cellId(worksheetId, copy.source);
    const sourceContent = workbook.revision.cells.get(sourceId)?.content ?? null;
    // リテラルと空 Cell は位置に依存しないため、そのまま複製できる。
    if (sourceContent?.kind !== "formula") {
      return {
        cellId: cellId(worksheetId, copy.target),
        content: sourceContent,
      };
    }

    // Formula だけはコピー元とコピー先の差分に従って相対参照を移動する。
    // 絶対参照を維持する責務も Formula Translator に閉じ込める。
    const translation = translateFormula(
      sourceContent.source,
      copy.source,
      copy.target,
    );
    if (translation.kind === "error") {
      throw new Error(translation.message);
    }
    return {
      cellId: cellId(worksheetId, copy.target),
      content: formulaContent(translation.source),
    };
  });
};
