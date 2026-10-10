import { useEffect, useState } from "react";
import { api } from "../api";
import { useMoney, useToast } from "../state";
import type { Finishes, Project } from "../types";

interface Suggestion { kind: string; category?: string; label: string; saving: number; styleFit: boolean; to?: { color: string }; patch?: Finishes }
interface OptimiseResult { currentTotal: number; suggestions: Suggestion[]; bestCombination: { patch: Finishes; total: number; saving: number } }

/** Suggest cheaper swaps that bring the renovation closer to budget, with one-click apply. */
export function BudgetOptimiser({ project, opts, grandTotal, save, currency }: { project: Project; opts: Record<string, unknown>; grandTotal: number; save: (p: Partial<Project>) => Promise<void>; currency: string }) {
  const money = useMoney(currency);
  const toast = useToast();
  const [data, setData] = useState<OptimiseResult | null>(null);
  const over = project.budget > 0 ? grandTotal - project.budget : 0;

  useEffect(() => {
    api.post<OptimiseResult>(`/projects/${project.id}/optimise`, opts).then(setData).catch(() => setData(null));
  }, [project.id, project.finishes, project.room, opts]);

  const apply = async (patch?: Finishes, label?: string) => {
    if (!patch) return;
    await save({ finishes: { ...project.finishes, ...patch } });
    toast.info(label ? `Applied: ${label}` : "Applied the best combination");
  };

  if (!data || data.suggestions.length === 0) {
    return <div className="card"><h3>Budget optimiser</h3><p className="small muted" style={{ margin: 0 }}>{Object.keys(project.finishes).length > 1 ? "You're already on the most economical finishes for this room. 👌" : "Choose finishes in the Materials tab to get money-saving suggestions."}</p></div>;
  }
  return (
    <div className="card stack">
      <div className="row between">
        <h3 style={{ margin: 0 }}>Budget optimiser</h3>
        {over > 0 ? <span className="chip bad">{money.format(over)} over budget</span> : project.budget > 0 ? <span className="chip good">Within budget</span> : null}
      </div>
      {data.bestCombination.saving > 0 && (
        <div className="row between card flat tight" style={{ background: "var(--accent-soft)" }}>
          <span className="small">Best combination saves <b>{money.format(data.bestCombination.saving)}</b>{over > 0 && data.bestCombination.saving >= over ? " — enough to get back on budget" : ""}</span>
          <button className="btn sm accent" onClick={() => apply(data.bestCombination.patch)}>Apply all swaps</button>
        </div>
      )}
      {data.suggestions.slice(0, 6).map((s, i) => (
        <div key={i} className="row between small" style={{ flexWrap: "nowrap", gap: 8 }}>
          <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            {s.to && <span className="swatch" style={{ background: s.to.color, width: 18, height: 18 }} />}
            <span>{s.label}{s.styleFit && s.kind === "swap" && <span className="chip accent" style={{ marginLeft: 6 }}>suits your style</span>}</span>
          </span>
          <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <b className="mono">−{money.format(s.saving)}</b>
            {s.patch ? <button className="btn sm" onClick={() => apply(s.patch, s.label)}>Apply</button> : <span className="tiny">adjust left</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Monthly repayments for financing a renovation (home-loan further advance or personal loan). */
export function FinancingCalculator({ amount, currency }: { amount: number; currency: string }) {
  const money = useMoney(currency);
  const [deposit, setDeposit] = useState(0);
  const [rate, setRate] = useState(11.5);
  const [years, setYears] = useState(5);
  const principal = Math.max(0, amount - money.toZar(deposit));
  const n = years * 12;
  const r = rate / 100 / 12;
  const monthly = n > 0 ? (r > 0 ? (principal * r) / (1 - Math.pow(1 + r, -n)) : principal / n) : 0;
  const totalPaid = monthly * n;
  return (
    <div className="card stack">
      <h3 style={{ margin: 0 }}>Financing calculator</h3>
      <div className="form-grid">
        <label className="field">Deposit / savings ({money.code})<input type="number" min={0} step={1000} value={deposit || ""} onChange={(e) => setDeposit(Number(e.target.value))} /></label>
        <label className="field">Interest rate (% p.a.)<input type="number" min={0} max={40} step={0.25} value={rate} onChange={(e) => setRate(Number(e.target.value))} /></label>
        <label className="field">Term (years)<select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 5, 7, 10, 15, 20].map((y) => <option key={y}>{y}</option>)}</select></label>
      </div>
      <div className="row between">
        <div className="stat"><span className="tiny">Monthly repayment</span><b>{money.format(monthly)}</b></div>
        <div className="small muted right">Financed {money.format(principal)}<br />Total interest {money.format(Math.max(0, totalPaid - principal))}</div>
      </div>
      <p className="tiny" style={{ margin: 0 }}>Illustrative only. A home-loan further advance is usually cheaper than a personal loan — ask your bank or a bond originator.</p>
    </div>
  );
}
