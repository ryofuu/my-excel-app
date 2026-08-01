import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CalculationInspection, SpreadsheetClient, WorkbookView } from "@/spreadsheet/contracts";

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
  const [selectedAddress, setSelectedAddress] = useState("A1");
  const [inspection, setInspection] = useState<CalculationInspection>(() => emptyInspection("A1"));
  const [isLoading, setIsLoading] = useState(true);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);
  const requestId = useRef(0);

  const inspect = useCallback(async (address: string) => {
    const id = ++requestId.current;
    try {
      const next = await client.inspect(address);
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

  const select = useCallback((address: string) => {
    setSelectedAddress(address);
    void inspect(address);
  }, [inspect]);

  const commit = useCallback(async (address: string, input: string) => {
    setIsCalculating(true);
    try {
      const next = await client.createCell({ address, input });
      setWorkbook(next);
      await inspect(address);
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
      await inspect(selectedAddress);
      setPulse((value) => value + 1);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Workbook could not be recalculated.");
    } finally {
      setIsCalculating(false);
    }
  }, [client, inspect, selectedAddress]);

  const selectedCell = useMemo(
    () => workbook?.cells.get(selectedAddress),
    [selectedAddress, workbook],
  );

  return {
    workbook,
    selectedAddress,
    selectedCell,
    inspection,
    isLoading,
    isCalculating,
    error,
    pulse,
    select,
    commit,
    recalculate,
  };
}
