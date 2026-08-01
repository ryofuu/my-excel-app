import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type FormulaBarProps = {
  readonly address: string;
  readonly input: string;
  readonly isEditing: boolean;
  readonly onCommit: (input: string) => void;
  readonly onCancel: () => void;
  readonly onStartEditing: () => void;
};

export function FormulaBar({ address, input, isEditing, onCommit, onCancel, onStartEditing }: FormulaBarProps) {
  const [draft, setDraft] = useState(input);

  useEffect(() => setDraft(input), [input]);

  const submit = () => onCommit(draft);

  return (
    <div className="formula-bar">
      <button className="name-box" type="button" aria-label="Selected cell">
        <span>{address}</span>
        <ChevronDown className="size-3 text-[var(--muted-foreground)]" />
      </button>
      <div className="formula-divider" />
      <span aria-hidden="true" className="formula-fx">fx</span>
      <div className="formula-divider" />
      {isEditing && (
        <div className="flex shrink-0 items-center gap-0.5 pr-1">
          <Button aria-label="Accept formula" className="text-[var(--accent)]" onClick={submit} size="icon-sm">
            <Check className="size-3.5" strokeWidth={2.4} />
          </Button>
          <Button aria-label="Cancel formula edit" onClick={onCancel} size="icon-sm">
            <X className="size-3.5" strokeWidth={2.2} />
          </Button>
        </div>
      )}
      <input
        aria-label="Formula bar"
        className="formula-input"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={onStartEditing}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
        value={isEditing ? draft : input}
      />
    </div>
  );
}
