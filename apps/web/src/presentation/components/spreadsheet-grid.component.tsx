import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react";

import {
  cellAddress,
  columnLabel,
  formatValue,
  parseAddress,
} from "@/presentation/spreadsheet/spreadsheet-grid.utility";
import {
  selectedAddresses,
  selectionBounds,
  type SpreadsheetSelection,
} from "@/presentation/spreadsheet/spreadsheet-selection.utility";
import type {
  CellInput,
  WorkbookView,
} from "@/usecases/spreadsheet-client.port";

const ROW_HEADER_WIDTH = 48;
const COLUMN_HEADER_HEIGHT = 26;
const BASE_COLUMN_WIDTH = 112;
const BASE_ROW_HEIGHT = 25;
const OVERSCAN = 3;

type SpreadsheetGridProps = {
  readonly workbook: WorkbookView | null;
  readonly selection: SpreadsheetSelection;
  readonly columnCount: number;
  readonly rowCount: number;
  readonly zoom: number;
  readonly onSelect: (selection: SpreadsheetSelection) => void;
  readonly onCommit: (
    inputs: readonly CellInput[],
    inspectedAddress: string,
  ) => Promise<void>;
  readonly onCopy: () => void;
  readonly onPaste: (text?: string) => void;
};

type EditingCell = {
  readonly address: string;
  readonly draft: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function nextAddress(address: string, key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Tab" | "Enter", columnCount: number, rowCount: number) {
  const current = parseAddress(address);
  if (!current) return address;
  const direction = key === "Tab" ? "ArrowRight" : key === "Enter" ? "ArrowDown" : key;
  const column = clamp(current.column + (direction === "ArrowLeft" ? -1 : direction === "ArrowRight" ? 1 : 0), 1, columnCount);
  const row = clamp(current.row + (direction === "ArrowUp" ? -1 : direction === "ArrowDown" ? 1 : 0), 1, rowCount);
  return cellAddress({ column, row });
}

export function SpreadsheetGrid({ workbook, selection, columnCount, rowCount, zoom, onSelect, onCommit, onCopy, onPaste }: SpreadsheetGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const clipboardRef = useRef<HTMLTextAreaElement>(null);
  const committingRef = useRef(false);
  const dragAnchorRef = useRef<string | null>(null);
  const dragPointerRef = useRef<number | null>(null);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [viewport, setViewport] = useState({ width: 960, height: 560 });
  const [editing, setEditing] = useState<EditingCell | null>(null);

  const columnWidth = Math.round(BASE_COLUMN_WIDTH * zoom);
  const rowHeight = Math.round(BASE_ROW_HEIGHT * zoom);
  const contentWidth = columnCount * columnWidth;
  const contentHeight = rowCount * rowHeight;

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const updateSize = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (editing && editing.address !== selection.anchor) setEditing(null);
  }, [editing, selection.anchor]);

  const ranges = useMemo(() => {
    const startColumn = clamp(Math.floor(scroll.left / columnWidth) + 1 - OVERSCAN, 1, columnCount);
    const endColumn = clamp(Math.ceil((scroll.left + viewport.width) / columnWidth) + OVERSCAN, 1, columnCount);
    const startRow = clamp(Math.floor(scroll.top / rowHeight) + 1 - OVERSCAN, 1, rowCount);
    const endRow = clamp(Math.ceil((scroll.top + viewport.height) / rowHeight) + OVERSCAN, 1, rowCount);
    return { startColumn, endColumn, startRow, endRow };
  }, [columnCount, columnWidth, rowCount, rowHeight, scroll, viewport]);

  const selectedBounds = useMemo(() => selectionBounds(selection), [selection]);

  const reveal = useCallback((address: string) => {
    const cell = parseAddress(address);
    const scroller = scrollRef.current;
    if (!cell || !scroller) return;
    const left = (cell.column - 1) * columnWidth;
    const right = left + columnWidth;
    const top = (cell.row - 1) * rowHeight;
    const bottom = top + rowHeight;
    if (left < scroller.scrollLeft) scroller.scrollLeft = left;
    if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth;
    if (top < scroller.scrollTop) scroller.scrollTop = top;
    if (bottom > scroller.scrollTop + scroller.clientHeight) scroller.scrollTop = bottom - scroller.clientHeight;
  }, [columnWidth, rowHeight]);

  useEffect(() => reveal(selection.focus), [reveal, selection.focus]);

  const selectCells = useCallback((nextSelection: SpreadsheetSelection) => {
    onSelect(nextSelection);
    scrollRef.current?.focus({ preventScroll: true });
  }, [onSelect]);

  const startEditing = useCallback((address: string, replacement?: string) => {
    const existing = workbook?.cells.get(address)?.input ?? "";
    setEditing({ address, draft: replacement ?? existing });
    onSelect({ anchor: address, focus: address });
  }, [onSelect, workbook]);

  const completeEditing = useCallback(async (move?: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Tab" | "Enter") => {
    const active = editing;
    if (!active || committingRef.current) return;
    committingRef.current = true;
    try {
      await onCommit(
        [{ address: active.address, input: active.draft }],
        active.address,
      );
      setEditing(null);
      if (move) {
        const address = nextAddress(active.address, move, columnCount, rowCount);
        selectCells({ anchor: address, focus: address });
      }
      else scrollRef.current?.focus({ preventScroll: true });
    } finally {
      committingRef.current = false;
    }
  }, [columnCount, editing, onCommit, rowCount, selectCells]);

  const cancelEditing = useCallback(() => {
    setEditing(null);
    scrollRef.current?.focus({ preventScroll: true });
  }, []);

  const addressFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const column = clamp(Math.floor((event.clientX - bounds.left + event.currentTarget.scrollLeft) / columnWidth) + 1, 1, columnCount);
    const row = clamp(Math.floor((event.clientY - bounds.top + event.currentTarget.scrollTop) / rowHeight) + 1, 1, rowCount);
    return cellAddress({ column, row });
  }, [columnCount, columnWidth, rowCount, rowHeight]);

  const startPointerSelection = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (editing || event.button !== 0) return;
    event.preventDefault();
    const address = addressFromPointer(event);
    const anchor = event.shiftKey ? selection.anchor : address;
    dragAnchorRef.current = anchor;
    dragPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    selectCells({ anchor, focus: address });
  }, [addressFromPointer, editing, selectCells, selection.anchor]);

  const movePointerSelection = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (
      dragPointerRef.current !== event.pointerId ||
      dragAnchorRef.current === null ||
      (event.buttons & 1) === 0
    ) {
      return;
    }
    selectCells({
      anchor: dragAnchorRef.current,
      focus: addressFromPointer(event),
    });
  }, [addressFromPointer, selectCells]);

  const finishPointerSelection = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragPointerRef.current !== event.pointerId) return;
    dragAnchorRef.current = null;
    dragPointerRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const renderCell = (column: number, row: number) => {
    const address = cellAddress({ column, row });
    const cell = workbook?.cells.get(address);
    const isSelected =
      column >= selectedBounds.startColumn &&
      column <= selectedBounds.endColumn &&
      row >= selectedBounds.startRow &&
      row <= selectedBounds.endRow;
    const isActive = address === selection.anchor;
    const isRangeEnd =
      column === selectedBounds.endColumn && row === selectedBounds.endRow;
    const isEditing = editing?.address === address;
    const isError = cell?.value.kind === "error";
    const isNumeric = cell?.value.kind === "number";
    const hasFormula = cell?.input.startsWith("=");
    const isDemoHeader = row === 3 && column >= 1 && column <= 4;

    return (
      <div
        aria-colindex={column}
        aria-rowindex={row}
        aria-selected={isSelected}
        className={[
          "sheet-cell",
          isSelected ? "sheet-cell--selected" : "",
          isActive ? "sheet-cell--active" : "",
          isSelected && row === selectedBounds.startRow ? "sheet-cell--range-top" : "",
          isSelected && column === selectedBounds.endColumn ? "sheet-cell--range-right" : "",
          isSelected && row === selectedBounds.endRow ? "sheet-cell--range-bottom" : "",
          isSelected && column === selectedBounds.startColumn ? "sheet-cell--range-left" : "",
          isRangeEnd ? "sheet-cell--range-end" : "",
          isError ? "sheet-cell--error" : "",
          isNumeric ? "sheet-cell--number" : "",
          hasFormula ? "sheet-cell--formula" : "",
          isDemoHeader ? "sheet-cell--demo-header" : "",
        ].filter(Boolean).join(" ")}
        id={`cell-${address}`}
        key={address}
        onDoubleClick={() => startEditing(address)}
        role="gridcell"
        style={{
          left: (column - 1) * columnWidth,
          top: (row - 1) * rowHeight,
          width: columnWidth,
          height: rowHeight,
        }}
        title={cell?.input || address}
      >
        {isEditing ? (
          <input
            aria-label={`Edit ${address}`}
            autoFocus
            className="sheet-cell-editor"
            onBlur={() => void completeEditing()}
            onChange={(event) => setEditing({ address, draft: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Tab") {
                event.preventDefault();
                void completeEditing(event.key);
              }
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
            }}
            value={editing.draft}
          />
        ) : (
          <span className="sheet-cell-value">{cell ? formatValue(cell.value) : ""}</span>
        )}
        {isRangeEnd && !isEditing && (
          <span aria-hidden="true" className="sheet-fill-handle" />
        )}
      </div>
    );
  };

  const cells: ReactElement[] = [];
  for (let row = ranges.startRow; row <= ranges.endRow; row += 1) {
    for (let column = ranges.startColumn; column <= ranges.endColumn; column += 1) {
      cells.push(renderCell(column, row));
    }
  }

  const columns: ReactElement[] = [];
  for (let column = ranges.startColumn; column <= ranges.endColumn; column += 1) {
    columns.push(
      <div
        className={`sheet-column-header ${column >= selectedBounds.startColumn && column <= selectedBounds.endColumn ? "sheet-header--selected" : ""}`}
        key={column}
        style={{ left: (column - 1) * columnWidth, width: columnWidth }}
      >
        {columnLabel(column)}
      </div>,
    );
  }

  const rows: ReactElement[] = [];
  for (let row = ranges.startRow; row <= ranges.endRow; row += 1) {
    rows.push(
      <div
        className={`sheet-row-header ${row >= selectedBounds.startRow && row <= selectedBounds.endRow ? "sheet-header--selected" : ""}`}
        key={row}
        style={{ top: (row - 1) * rowHeight, height: rowHeight }}
      >
        {row}
      </div>,
    );
  }

  return (
    <section aria-label="Spreadsheet grid" className="spreadsheet-grid-shell">
      <div className="sheet-corner" aria-hidden="true">
        <span />
      </div>
      <div className="sheet-column-viewport" aria-hidden="true">
        <div className="sheet-column-canvas" style={{ transform: `translateX(${-scroll.left}px)`, width: contentWidth }}>
          {columns}
        </div>
      </div>
      <div className="sheet-row-viewport" aria-hidden="true">
        <div className="sheet-row-canvas" style={{ transform: `translateY(${-scroll.top}px)`, height: contentHeight }}>
          {rows}
        </div>
      </div>
      <div
        aria-activedescendant={`cell-${selection.anchor}`}
        aria-colcount={columnCount}
        aria-rowcount={rowCount}
        className="sheet-scroll-viewport"
        onKeyDown={(event) => {
          if (!editing && (event.metaKey || event.ctrlKey)) {
            if (event.key.toLowerCase() === "c") {
              event.preventDefault();
              onCopy();
            }
            if (event.key.toLowerCase() === "v") {
              clipboardRef.current?.focus({ preventScroll: true });
            }
            return;
          }
          if (editing || event.altKey) return;
          const navigationKeys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab", "Enter"] as const;
          if (navigationKeys.includes(event.key as (typeof navigationKeys)[number])) {
            event.preventDefault();
            const key = event.key as (typeof navigationKeys)[number];
            const extendsRange = event.shiftKey && key.startsWith("Arrow");
            const address = nextAddress(
              extendsRange ? selection.focus : selection.anchor,
              key,
              columnCount,
              rowCount,
            );
            selectCells(
              extendsRange
                ? { anchor: selection.anchor, focus: address }
                : { anchor: address, focus: address },
            );
            return;
          }
          if (event.key === "F2") {
            event.preventDefault();
            startEditing(selection.anchor);
            return;
          }
          if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            void onCommit(
              selectedAddresses(selection).map((address) => ({
                address,
                input: "",
              })),
              selection.anchor,
            );
            return;
          }
          if (event.key.length === 1) {
            event.preventDefault();
            startEditing(selection.anchor, event.key);
          }
        }}
        onPaste={(event) => {
          if (editing) return;
          event.preventDefault();
          onPaste(event.clipboardData.getData("text/plain"));
        }}
        onPointerCancel={finishPointerSelection}
        onPointerDown={startPointerSelection}
        onPointerMove={movePointerSelection}
        onPointerUp={finishPointerSelection}
        onScroll={(event) => setScroll({ left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop })}
        ref={scrollRef}
        role="grid"
        tabIndex={0}
      >
        <div
          className="sheet-canvas"
          style={{
            width: contentWidth,
            height: contentHeight,
            backgroundSize: `${columnWidth}px ${rowHeight}px`,
          }}
        >
          {cells}
        </div>
      </div>
      <textarea
        aria-label="Spreadsheet clipboard"
        className="sheet-clipboard-input"
        onPaste={(event) => {
          event.preventDefault();
          onPaste(event.clipboardData.getData("text/plain"));
          event.currentTarget.value = "";
          scrollRef.current?.focus({ preventScroll: true });
        }}
        ref={clipboardRef}
        tabIndex={-1}
      />
    </section>
  );
}

export const gridMetrics = { ROW_HEADER_WIDTH, COLUMN_HEADER_HEIGHT };
