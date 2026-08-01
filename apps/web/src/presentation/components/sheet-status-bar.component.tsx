import { Check, CircleGauge, ZoomIn, ZoomOut } from "lucide-react";

import { Button } from "@/presentation/components/ui/button.component";
import type { CellView } from "@/usecases/spreadsheet-client.port";

type SheetStatusBarProps = {
  readonly selectedAddress: string;
  readonly selectedCell?: CellView;
  readonly revision: number;
  readonly zoom: number;
  readonly onZoomChange: (zoom: number) => void;
};

export function SheetStatusBar({ selectedAddress, selectedCell, revision, zoom, onZoomChange }: SheetStatusBarProps) {
  const percentage = Math.round(zoom * 100);
  return (
    <footer className="sheet-statusbar">
      <div className="sheet-tabs">
        <span className="sheet-tab sheet-tab--active">Sheet1</span>
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
