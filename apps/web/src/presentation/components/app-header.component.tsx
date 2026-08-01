import { Cloud, FileSpreadsheet, PanelRightClose, PanelRightOpen } from "lucide-react";

import { Button } from "@/presentation/components/ui/button.component";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/presentation/components/ui/tooltip.component";

type AppHeaderProps = {
  readonly workbookName: string;
  readonly revision: number;
  readonly inspectorOpen: boolean;
  readonly onToggleInspector: () => void;
};

export function AppHeader({ workbookName, revision, inspectorOpen, onToggleInspector }: AppHeaderProps) {
  return (
    <header className="app-titlebar">
      <div className="app-mark" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="min-w-0 leading-none">
        <div className="flex items-center gap-2">
          <h1 className="truncate font-display text-[15px] font-semibold tracking-[0.015em] text-white">GRIDLINE</h1>
          <span className="hidden border-l border-white/20 pl-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/55 sm:inline">formula lab</span>
        </div>
      </div>

      <div className="ml-4 flex min-w-0 flex-1 items-center justify-center">
        <div className="title-document-name" title="Workbook name">
          <FileSpreadsheet className="size-3.5 text-[#b8d5be]" strokeWidth={1.9} />
          <span className="max-w-48 truncate">{workbookName}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="hidden items-center gap-1.5 pr-1 font-mono text-[10px] text-[#b8d5be] lg:flex">
          <Cloud className="size-3" strokeWidth={1.8} /> local · r{revision}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={inspectorOpen ? "Hide calculation inspector" : "Show calculation inspector"}
              className="text-white/82 hover:bg-white/10 hover:text-white"
              onClick={onToggleInspector}
              size="icon-sm"
            >
              {inspectorOpen ? <PanelRightClose className="size-3.5" strokeWidth={1.8} /> : <PanelRightOpen className="size-3.5" strokeWidth={1.8} />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{inspectorOpen ? "Hide" : "Show"} calculation inspector</TooltipContent>
        </Tooltip>
      </div>
    </header>
  );
}
