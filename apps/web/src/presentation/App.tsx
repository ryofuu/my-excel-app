import { useState } from "react";

import { AppHeader } from "@/presentation/components/app-header";
import { CalculationInspector } from "@/presentation/components/calculation-inspector";
import { FormulaBar } from "@/presentation/components/formula-bar";
import { SheetStatusBar } from "@/presentation/components/sheet-status-bar";
import { SpreadsheetGrid } from "@/presentation/components/spreadsheet-grid";
import { TooltipProvider } from "@/presentation/components/ui/tooltip";
import { WorkbookToolbar } from "@/presentation/components/workbook-toolbar";
import { useSpreadsheet } from "@/presentation/hooks/use-spreadsheet";
import {
  DEFAULT_COLUMN_COUNT,
  DEFAULT_ROW_COUNT,
} from "@/presentation/spreadsheet/grid";
import type { SpreadsheetClient } from "@/usecases/spreadsheet-client";

type AppProps = Readonly<{
  client: SpreadsheetClient;
}>;

export default function App({ client }: AppProps) {
  const spreadsheet = useSpreadsheet(client);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [formulaEditing, setFormulaEditing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [copiedCell, setCopiedCell] = useState<
    Readonly<{ address: string; input: string }> | null
  >(null);

  const select = (address: string) => {
    setFormulaEditing(false);
    spreadsheet.select(address);
  };

  const commit = async (
    address: string,
    input: string,
    copiedFromAddress?: string,
  ) => {
    setFormulaEditing(false);
    await spreadsheet.commit(address, input, copiedFromAddress);
  };

  const copySelectedCell = () => {
    setCopiedCell({
      address: spreadsheet.selectedAddress,
      input: spreadsheet.selectedCell?.input ?? "",
    });
  };

  const pasteCopiedCell = async () => {
    if (copiedCell === null) return;
    await commit(
      spreadsheet.selectedAddress,
      copiedCell.input,
      copiedCell.address,
    );
  };

  const workbookName = spreadsheet.workbook?.name ?? "Formula laboratory";
  const revision = spreadsheet.workbook?.revision ?? 1;

  return (
    <TooltipProvider delayDuration={350}>
      <div className="app-shell">
        <AppHeader
          inspectorOpen={inspectorOpen}
          onToggleInspector={() => setInspectorOpen((open) => !open)}
          revision={revision}
          workbookName={workbookName}
        />
        <WorkbookToolbar
          canPaste={copiedCell !== null}
          isCalculating={spreadsheet.isCalculating}
          onCopy={copySelectedCell}
          onPaste={() => void pasteCopiedCell()}
          onRecalculate={() => void spreadsheet.recalculate()}
        />
        <FormulaBar
          address={spreadsheet.selectedAddress}
          input={spreadsheet.selectedCell?.input ?? ""}
          isEditing={formulaEditing}
          onCancel={() => setFormulaEditing(false)}
          onCommit={(input) => void commit(spreadsheet.selectedAddress, input)}
          onStartEditing={() => setFormulaEditing(true)}
        />
        <main className={`workbook-main ${inspectorOpen ? "workbook-main--with-inspector" : ""}`}>
          <div className="workbook-grid-region">
            {spreadsheet.isLoading && (
              <div className="workbook-loading" role="status">
                <span className="loading-grid" />
                <span>Opening workbook…</span>
              </div>
            )}
            {spreadsheet.error && (
              <div className="workbook-problem" role="alert">
                <strong>Calculation connection</strong>
                <span>{spreadsheet.error}</span>
              </div>
            )}
            <SpreadsheetGrid
              columnCount={DEFAULT_COLUMN_COUNT}
              onCommit={commit}
              onCopy={copySelectedCell}
              onPaste={() => void pasteCopiedCell()}
              onSelect={select}
              rowCount={DEFAULT_ROW_COUNT}
              selectedAddress={spreadsheet.selectedAddress}
              workbook={spreadsheet.workbook}
              zoom={zoom}
            />
          </div>
          {inspectorOpen && (
            <CalculationInspector
              inspection={spreadsheet.inspection}
              pulse={spreadsheet.pulse}
              revision={revision}
            />
          )}
        </main>
        <SheetStatusBar
          onZoomChange={setZoom}
          revision={revision}
          selectedAddress={spreadsheet.selectedAddress}
          selectedCell={spreadsheet.selectedCell}
          zoom={zoom}
        />
      </div>
    </TooltipProvider>
  );
}
