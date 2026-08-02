import { Check, CircleGauge, Plus, X, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/presentation/components/ui/button.component";
import type { CellView, WorksheetView } from "@/usecases/spreadsheet-client.port";

type SheetStatusBarProps = {
  readonly selectedAddress: string;
  readonly selectedCell?: CellView;
  readonly worksheets: readonly WorksheetView[];
  readonly activeWorksheetId?: string;
  readonly isBusy: boolean;
  readonly revision: number;
  readonly zoom: number;
  readonly onCreateWorksheet: () => void;
  readonly onDeleteWorksheet: () => void;
  readonly onOpenWorksheet: (worksheetId: string) => void;
  readonly onZoomChange: (zoom: number) => void;
};

export function SheetStatusBar({
  selectedAddress,
  selectedCell,
  worksheets,
  activeWorksheetId,
  isBusy,
  revision,
  zoom,
  onCreateWorksheet,
  onDeleteWorksheet,
  onOpenWorksheet,
  onZoomChange,
}: SheetStatusBarProps) {
  const percentage = Math.round(zoom * 100);
  return (
    <footer className="sheet-statusbar">
      <div aria-label="Worksheets" className="sheet-tabs" role="tablist">
        <Button
          aria-label="Create worksheet"
          className="sheet-add"
          disabled={isBusy}
          onClick={onCreateWorksheet}
          size="icon-sm"
          variant="ghost"
        >
          <Plus className="size-3.5" />
        </Button>
        {worksheets.map((worksheet) => {
          const active = worksheet.id === activeWorksheetId;
          return (
            <div
              className={`sheet-tab-shell ${active ? "sheet-tab-shell--active" : ""}`}
              key={worksheet.id}
            >
              <button
                aria-selected={active}
                className="sheet-tab"
                disabled={isBusy}
                onClick={() => onOpenWorksheet(worksheet.id)}
                role="tab"
                type="button"
              >
                {worksheet.name}
              </button>
              {active && worksheets.length > 1 && (
                <button
                  aria-label={`Delete ${worksheet.name}`}
                  className="sheet-tab-delete"
                  disabled={isBusy}
                  onClick={onDeleteWorksheet}
                  type="button"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="status-center">
        <span className="status-ready"><Check className="size-3" /> Ready</span>
        <span className="status-separator" />
        <span className="font-mono">{selectedAddress}</span>
        <span className="status-separator" />
        <span>{selectedCell?.value.kind ?? "blank"}</span>
        <span className="status-separator" />
        <span className="hidden items-center gap-1 md:inline-flex"><CircleGauge className="size-3" /> Automatic</span>
        <span className="hidden font-mono text-white/65 lg:inline">r{revision}</span>
      </div>
      <div className="status-zoom">
        <Button aria-label="Zoom out" disabled={zoom <= 0.8} onClick={() => onZoomChange(Math.max(0.8, zoom - 0.1))} size="icon-sm"><ZoomOut className="size-3.5" /></Button>
        <span>{percentage}%</span>
        <Button aria-label="Zoom in" disabled={zoom >= 1.2} onClick={() => onZoomChange(Math.min(1.2, zoom + 0.1))} size="icon-sm"><ZoomIn className="size-3.5" /></Button>
      </div>
    </footer>
  );
}
