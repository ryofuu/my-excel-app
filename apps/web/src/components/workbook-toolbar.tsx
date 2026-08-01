import { ClipboardPaste, Copy, Eye, FunctionSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type WorkbookToolbarProps = {
  readonly canPaste: boolean;
  readonly onCopy: () => void;
  readonly onPaste: () => void;
  readonly onRecalculate: () => void;
  readonly isCalculating: boolean;
};

function ToolButton({ label, children, onClick, active = false, disabled = false }: { readonly label: string; readonly children: React.ReactNode; readonly onClick?: () => void; readonly active?: boolean; readonly disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} className={active ? "bg-[var(--selection-soft)] text-[var(--accent)]" : undefined} disabled={disabled} onClick={onClick} size="icon-sm">
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function Divider() {
  return <div aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--line)]" />;
}

export function WorkbookToolbar({ canPaste, onCopy, onPaste, onRecalculate, isCalculating }: WorkbookToolbarProps) {
  return (
    <div className="workbook-toolbar" role="toolbar" aria-label="Workbook tools">
      <div className="toolbar-group text-[var(--muted-foreground)]">
        <span className="px-2 font-display text-xs font-semibold text-[var(--foreground)]">Formula</span>
        <span className="hidden font-mono text-[10px] sm:inline">copy · inspect · recalculate</span>
      </div>
      <Divider />
      <div className="toolbar-group">
        <ToolButton label="Copy selected cell" onClick={onCopy}><Copy className="size-3.5" /></ToolButton>
        <ToolButton disabled={!canPaste} label="Paste copied cell" onClick={onPaste}><ClipboardPaste className="size-3.5" /></ToolButton>
      </div>
      <Divider />
      <div className="toolbar-group">
        <Button className="gap-1.5 font-medium" onClick={onRecalculate} size="sm" variant="outline">
          {isCalculating ? <span className="size-2 animate-pulse rounded-full bg-[var(--accent)]" /> : <FunctionSquare className="size-3.5 text-[var(--accent)]" />}
          Recalculate
        </Button>
      </div>
      <div className="ml-auto hidden items-center gap-1 text-[var(--muted-foreground)] xl:flex">
        <Eye className="size-3.5" />
        <span className="font-mono text-[10px]">formula view</span>
      </div>
    </div>
  );
}
