import { useState } from "react";

import { AppHeader } from "@/presentation/components/app-header.component";
import { CalculationInspector } from "@/presentation/components/calculation-inspector.component";
import { FormulaBar } from "@/presentation/components/formula-bar.component";
import { SheetStatusBar } from "@/presentation/components/sheet-status-bar.component";
import { SpreadsheetGrid } from "@/presentation/components/spreadsheet-grid.component";
import { TooltipProvider } from "@/presentation/components/ui/tooltip.component";
import { WorkbookToolbar } from "@/presentation/components/workbook-toolbar.component";
import { useSpreadsheet } from "@/presentation/hooks/use-spreadsheet.hook";
import {
  DEFAULT_COLUMN_COUNT,
  DEFAULT_ROW_COUNT,
} from "@/presentation/spreadsheet/spreadsheet-grid.utility";
import {
  cellInputsForPaste,
  spreadsheetClipboard,
  spreadsheetClipboardFromText,
  type SpreadsheetClipboard,
} from "@/presentation/spreadsheet/spreadsheet-clipboard.utility";
import { selectionLabel, type SpreadsheetSelection } from "@/presentation/spreadsheet/spreadsheet-selection.utility";
import type {
  CellInput,
  SpreadsheetClient,
} from "@/usecases/spreadsheet-client.port";

type AppProps = Readonly<{
  client: SpreadsheetClient;
}>;

export default function App({ client }: AppProps) {
  const spreadsheet = useSpreadsheet(client);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [formulaEditing, setFormulaEditing] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [copiedCells, setCopiedCells] = useState<SpreadsheetClipboard | null>(null);

  const select = (selection: SpreadsheetSelection) => {
    setFormulaEditing(false);
    spreadsheet.select(selection);
  };

  const commit = async (
    inputs: readonly CellInput[],
    inspectedAddress: string,
  ) => {
    setFormulaEditing(false);
    await spreadsheet.commit(inputs, inspectedAddress);
  };

  const copySelection = async () => {
    if (spreadsheet.workbook === null) return;
    const clipboard = spreadsheetClipboard(
      spreadsheet.workbook,
      spreadsheet.selection,
    );
    setCopiedCells(clipboard);
    try {
      await navigator.clipboard?.writeText(clipboard.text);
    } catch {
      // The in-app clipboard remains available when browser permission is denied.
    }
  };

  const pasteSelection = async (pastedText?: string) => {
    let clipboard: SpreadsheetClipboard | null = null;
    if (pastedText !== undefined) {
      const external = spreadsheetClipboardFromText(pastedText);
      clipboard = copiedCells?.text === external.text ? copiedCells : external;
    } else {
      clipboard = copiedCells;
    }
    if (clipboard === null) return;
    const inputs = cellInputsForPaste(
      clipboard,
      spreadsheet.selection.anchor,
    );
    await commit(inputs, spreadsheet.selection.anchor);
  };

  const workbookName = spreadsheet.workbook?.name ?? "Formula laboratory";
  const revision = spreadsheet.workbook?.revision ?? 1;
  const activeWorksheet = spreadsheet.workbook?.worksheets.find(
    (worksheet) => worksheet.id === spreadsheet.workbook?.activeWorksheetId,
  );

  const deleteWorksheet = () => {
    if (
      activeWorksheet === undefined ||
      !window.confirm(`Delete ${activeWorksheet.name}? Its cells will be removed.`)
    ) {
      return;
    }
    void spreadsheet.deleteWorksheet();
  };

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
          canPaste={copiedCells !== null}
          isCalculating={spreadsheet.isCalculating}
          onCopy={() => void copySelection()}
          onPaste={() => void pasteSelection()}
          onRecalculate={() => void spreadsheet.recalculate()}
        />
        <FormulaBar
          address={spreadsheet.selectedAddress}
          input={spreadsheet.selectedCell?.input ?? ""}
          isEditing={formulaEditing}
          onCancel={() => setFormulaEditing(false)}
          onCommit={(input) =>
            void commit(
              [{ address: spreadsheet.selectedAddress, input }],
              spreadsheet.selectedAddress,
            )
          }
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
              onCopy={() => void copySelection()}
              onPaste={(text) => void pasteSelection(text)}
              onSelect={select}
              rowCount={DEFAULT_ROW_COUNT}
              selection={spreadsheet.selection}
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
          activeWorksheetId={spreadsheet.workbook?.activeWorksheetId}
          isBusy={spreadsheet.isCalculating || spreadsheet.isLoading}
          onCreateWorksheet={() => void spreadsheet.createWorksheet()}
          onDeleteWorksheet={deleteWorksheet}
          onOpenWorksheet={(worksheetId) =>
            void spreadsheet.openWorksheet(worksheetId)
          }
          onZoomChange={setZoom}
          revision={revision}
          selectedAddress={selectionLabel(spreadsheet.selection)}
          selectedCell={spreadsheet.selectedCell}
          worksheets={spreadsheet.workbook?.worksheets ?? []}
          zoom={zoom}
        />
      </div>
    </TooltipProvider>
  );
}
