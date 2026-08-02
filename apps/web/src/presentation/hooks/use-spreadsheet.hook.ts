import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  parseA1Address,
  parseCellInput,
  worksheetId,
} from "@gridline/core/domain";

import type {
  CalculationInspection,
  CreateWorkbookRevisionCommand,
  SpreadsheetClient,
  WorkbookView,
} from "@/usecases/spreadsheet-client.port";
import type { SpreadsheetSelection } from "@/presentation/spreadsheet/spreadsheet-selection.utility";
import type { WorkbookRevisionDraft } from "@/presentation/spreadsheet/workbook-revision.draft";

const revisionCommand = (
  draft: WorkbookRevisionDraft,
): CreateWorkbookRevisionCommand => {
  // UI の生文字列は Presentation 境界で一度だけ VO に変換する。
  // 以降の UseCase は、検証済みの Address / CellContent だけを受け取る。
  if (draft.kind === "set-cell-contents") {
    return {
      kind: "set-cell-contents",
      changes: draft.inputs.map((input) => ({
        address: parseA1Address(input.address),
        content: parseCellInput(input.input),
      })),
    };
  }
  // 内部コピーでは内容を文字列化せず、位置だけを渡して現在の CellContent を UseCase で取得する。
  return {
    kind: "copy-cells",
    copies: draft.copies.map((copy) => ({
      source: parseA1Address(copy.sourceAddress),
      target: parseA1Address(copy.targetAddress),
    })),
  };
};

const emptyInspection = (address: string): CalculationInspection => ({
  address,
  source: null,
  tokens: [],
  ast: null,
  precedents: [],
  dependents: [],
  dirtyCells: [],
  evaluationOrder: [],
  errors: [],
});

export function useSpreadsheet(client: SpreadsheetClient) {
  const [workbook, setWorkbook] = useState<WorkbookView | null>(null);
  const [selection, setSelection] = useState<SpreadsheetSelection>({
    anchor: "A1",
    focus: "A1",
  });
  const [inspection, setInspection] = useState<CalculationInspection>(() => emptyInspection("A1"));
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  const requestId = useRef(0);

  const inspect = useCallback(async (address: string) => {
    const id = ++requestId.current;
    try {
      const next = await client.inspect(parseA1Address(address));
      if (id === requestId.current) setInspection(next);
    } catch (reason) {
      if (id === requestId.current) setError(reason instanceof Error ? reason.message : "Could not inspect the selected cell.");
    }
  }, [client]);

  useEffect(() => {
    let live = true;
    void (async () => {
      setIsLoading(true);
      try {
        const next = await client.open();
        if (!live) return;
        setWorkbook(next);
        await inspect("A1");
      } catch (reason) {
        if (live) setError(reason instanceof Error ? reason.message : "Workbook could not be opened.");
      } finally {
        if (live) setIsLoading(false);
      }
    })();
    return () => {
      live = false;
      client.dispose();
    };
  }, [client, inspect]);

  const select = useCallback((next: SpreadsheetSelection) => {
    setSelection(next);
    void inspect(next.anchor);
  }, [inspect]);

  const commit = useCallback(async (
    draft: WorkbookRevisionDraft,
    inspectedAddress: string,
  ) => {
    setIsCalculating(true);
    try {
      // Draft の検証に成功してから初めて Revision 作成へ進む。
      const next = await client.createRevision(revisionCommand(draft));
      setWorkbook(next);
      await inspect(inspectedAddress);
      setPulse((value) => value + 1);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Cell could not be saved.");
    } finally {
      setIsCalculating(false);
    }
  }, [client, inspect]);

  const recalculate = useCallback(async () => {
    setIsCalculating(true);
    try {
      const next = await client.recalculate();
      setWorkbook(next);
      await inspect(selection.anchor);
      setPulse((value) => value + 1);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Workbook could not be recalculated.");
    } finally {
      setIsCalculating(false);
    }
  }, [client, inspect, selection.anchor]);

  const openWorksheet = useCallback(async (worksheetIdValue: string) => {
    setIsCalculating(true);
    try {
      const next = await client.open(worksheetId(worksheetIdValue));
      const initialSelection = { anchor: "A1", focus: "A1" } as const;
      setWorkbook(next);
      setSelection(initialSelection);
      await inspect(initialSelection.anchor);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Worksheet could not be opened.");
    } finally {
      setIsCalculating(false);
    }
  }, [client, inspect]);

  const createWorksheet = useCallback(async () => {
    setIsCalculating(true);
    try {
      const next = await client.createWorksheet();
      const initialSelection = { anchor: "A1", focus: "A1" } as const;
      setWorkbook(next);
      setSelection(initialSelection);
      await inspect(initialSelection.anchor);
      setPulse((value) => value + 1);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Worksheet could not be created.");
    } finally {
      setIsCalculating(false);
    }
  }, [client, inspect]);

  const deleteWorksheet = useCallback(async () => {
    setIsCalculating(true);
    try {
      const next = await client.deleteWorksheet();
      const initialSelection = { anchor: "A1", focus: "A1" } as const;
      setWorkbook(next);
      setSelection(initialSelection);
      await inspect(initialSelection.anchor);
      setPulse((value) => value + 1);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Worksheet could not be deleted.");
    } finally {
      setIsCalculating(false);
    }
  }, [client, inspect]);

  const selectedCell = useMemo(
    () => workbook?.cells.get(selection.anchor),
    [selection.anchor, workbook],
  );

  return {
    workbook,
    selection,
    selectedAddress: selection.anchor,
    selectedCell,
    inspection,
    isLoading,
    isCalculating,
    error,
    pulse,
    select,
    commit,
    recalculate,
    openWorksheet,
    createWorksheet,
    deleteWorksheet,
  };
}
