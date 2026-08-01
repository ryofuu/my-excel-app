import { Braces, ChevronDown, CircleAlert, GitBranch, Network, ScanSearch, Sigma, Sparkles, Waypoints } from "lucide-react";

import type { CalculationInspection } from "@/spreadsheet/contracts";

type CalculationInspectorProps = {
  readonly inspection: CalculationInspection;
  readonly pulse: number;
  readonly revision: number;
};

function Section({ title, icon, children, defaultOpen = true }: { readonly title: string; readonly icon: React.ReactNode; readonly children: React.ReactNode; readonly defaultOpen?: boolean }) {
  return (
    <details className="inspector-section" open={defaultOpen}>
      <summary>
        <span className="inspector-section-icon">{icon}</span>
        <span>{title}</span>
        <ChevronDown className="ml-auto size-3 text-[var(--muted-foreground)] transition-transform" />
      </summary>
      <div className="inspector-section-content">{children}</div>
    </details>
  );
}

function AddressPills({ addresses, empty }: { readonly addresses: readonly string[]; readonly empty: string }) {
  if (addresses.length === 0) return <p className="inspector-empty">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {addresses.map((address) => <span className="address-pill" key={address}>{address}</span>)}
    </div>
  );
}

export function CalculationInspector({ inspection, pulse, revision }: CalculationInspectorProps) {
  const isFormula = inspection.source?.startsWith("=");

  return (
    <aside aria-label="Calculation inspector" className="calculation-inspector">
      <div className="inspector-heading">
        <div>
          <div className="inspector-kicker"><ScanSearch className="size-3" /> live trace</div>
          <h2>Calculation Inspector</h2>
        </div>
        <div className="inspector-cell-reference">{inspection.address}</div>
      </div>

      <div className="inspector-revision-line">
        <span className="live-dot" key={pulse} />
        <span>snapshot r{revision}</span>
        <span className="mx-1 text-[var(--line-strong)]">/</span>
        <span>{isFormula ? "formula" : inspection.source ? "literal" : "blank"}</span>
      </div>

      <div className="inspector-scroll">
        <Section icon={<Sigma className="size-3.5" />} title="Formula source">
          <code className={`formula-source ${isFormula ? "formula-source--active" : ""}`}>
            {inspection.source === null
              ? "∅  blank cell"
              : inspection.source === ""
                ? '""  empty text'
                : inspection.source}
          </code>
        </Section>

        <Section icon={<Braces className="size-3.5" />} title={`Tokens · ${inspection.tokens.length}`}>
          {inspection.tokens.length === 0 ? (
            <p className="inspector-empty">A literal has no formula tokens.</p>
          ) : (
            <div className="token-rack">
              {inspection.tokens.map((token, index) => (
                <span className={`token-chip token-chip--${token.kind}`} key={`${token.lexeme}-${index}`}>
                  <small>{token.kind}</small>{token.lexeme}
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section icon={<Waypoints className="size-3.5" />} title="AST">
          {inspection.ast ? <pre className="ast-preview">{inspection.ast}</pre> : <p className="inspector-empty">No expression tree.</p>}
        </Section>

        <Section icon={<GitBranch className="size-3.5" />} title="Dependency graph">
          <div className="dependency-block">
            <span>Precedents</span>
            <AddressPills addresses={inspection.precedents} empty="No incoming edges." />
          </div>
          <div className="dependency-block">
            <span>Dependents</span>
            <AddressPills addresses={inspection.dependents} empty="No outgoing edges." />
          </div>
        </Section>

        <Section icon={<Network className="size-3.5" />} title="Recalculation trace">
          <div className="trace-stat">
            <span>Dirty cells</span>
            <b>{inspection.dirtyCells.length}</b>
          </div>
          <AddressPills addresses={inspection.dirtyCells} empty="No pending dirty cells." />
          <div className="trace-stat mt-3">
            <span>Evaluation order</span>
            <b>{inspection.evaluationOrder.length}</b>
          </div>
          {inspection.evaluationOrder.length > 0 ? (
            <ol className="evaluation-order">
              {inspection.evaluationOrder.slice(0, 14).map((address, index) => <li key={`${address}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span>{address}</li>)}
              {inspection.evaluationOrder.length > 14 && <li className="text-[var(--muted-foreground)]">… {inspection.evaluationOrder.length - 14} more</li>}
            </ol>
          ) : <p className="inspector-empty">No computed cells yet.</p>}
        </Section>

        <Section defaultOpen={inspection.errors.length > 0} icon={<CircleAlert className="size-3.5" />} title={`Errors · ${inspection.errors.length}`}>
          {inspection.errors.length === 0 ? (
            <p className="inspector-empty inspector-empty--okay"><Sparkles className="size-3" /> Clean calculation graph.</p>
          ) : (
            <ul className="error-list">
              {inspection.errors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}
            </ul>
          )}
        </Section>
      </div>
    </aside>
  );
}
