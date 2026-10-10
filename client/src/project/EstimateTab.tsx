import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth, useCatalog, useMoney, useToast } from "../state";
import type { Estimate } from "../types";
import type { TabProps } from "./context";
import { BudgetOptimiser, FinancingCalculator } from "./BudgetTools";

interface EstimateResponse { estimate: Estimate; furnitureTotal: number; budget: number; grandTotal: number }

export default function EstimateTab({ bundle, goTo, save }: TabProps) {
  const { user } = useAuth();
  const catalog = useCatalog();
  const [currency, setCurrency] = useState(user?.currency ?? "ZAR");
  const money = useMoney(currency);
  const toast = useToast();
  const [opts, setOpts] = useState({ quality: "standard", includeDemolition: false, electricalPoints: 0, plumbingPoints: 0, contingency: 0.1 });
  const [data, setData] = useState<EstimateResponse | null>(null);

  useEffect(() => {
    api.post<EstimateResponse>(`/projects/${bundle.project.id}/estimate`, opts).then(setData).catch(toast.error);
  }, [bundle.project.id, bundle.project.finishes, bundle.project.room, opts, toast]);

  const hasFinishes = ["flooring", "wall", "ceiling", "tiles", "countertop", "cabinetry"].some((k) => bundle.project.finishes[k]);
  const e = data?.estimate;
  const budgetPct = data && data.budget ? (data.grandTotal / data.budget) * 100 : 0;

  return (
    <div className="split">
      <div className="stack no-print">
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Assumptions</h3>
          <label className="field">Finish quality
            <select value={opts.quality} onChange={(ev) => setOpts({ ...opts, quality: ev.target.value })}>
              <option value="budget">Budget</option><option value="standard">Standard</option><option value="premium">Premium</option>
            </select>
          </label>
          <label className="check"><input type="checkbox" checked={opts.includeDemolition} onChange={(ev) => setOpts({ ...opts, includeDemolition: ev.target.checked })} /> Include strip-out & rubble removal</label>
          <div className="form-grid">
            <label className="field">Electrical points<input type="number" min={0} value={opts.electricalPoints} onChange={(ev) => setOpts({ ...opts, electricalPoints: Math.max(0, Number(ev.target.value)) })} /></label>
            <label className="field">Plumbing points<input type="number" min={0} value={opts.plumbingPoints} onChange={(ev) => setOpts({ ...opts, plumbingPoints: Math.max(0, Number(ev.target.value)) })} /></label>
          </div>
          <label className="field">Contingency: {Math.round(opts.contingency * 100)}%
            <input type="range" min={0} max={0.3} step={0.05} value={opts.contingency} onChange={(ev) => setOpts({ ...opts, contingency: Number(ev.target.value) })} />
          </label>
          <label className="field">Show amounts in
            <select value={currency} onChange={(ev) => setCurrency(ev.target.value)}>{Object.keys(catalog.currencies).map((c) => <option key={c}>{c}</option>)}</select>
          </label>
          <p className="tiny" style={{ margin: 0 }}>Regional pricing for {user?.province}. Change your province in Account.</p>
        </div>
        {data && <BudgetOptimiser project={bundle.project} opts={opts} grandTotal={data.grandTotal} save={save} currency={currency} />}
        {data && <FinancingCalculator amount={data.grandTotal} currency={currency} />}
        {!hasFinishes && <div className="card"><p className="small">Pick flooring, paint and other finishes to build a full estimate.</p><button className="btn sm accent" onClick={() => goTo("materials")}>Choose materials</button></div>}
      </div>

      <div className="stack">
        {!e ? <p className="muted">Calculating…</p> : (
          <>
            <div className="grid cols-4">
              <div className="card stat"><span className="tiny">Renovation (incl. VAT)</span><b>{money.format(e.totals.total)}</b><span className="tiny">Range {money.format(e.range.low)} – {money.format(e.range.high)}</span></div>
              <div className="card stat"><span className="tiny">Furniture & products</span><b>{money.format(data.furnitureTotal)}</b><span className="tiny">from your shopping list</span></div>
              <div className="card stat"><span className="tiny">Project total</span><b>{money.format(data.grandTotal)}</b></div>
              <div className="card stat"><span className="tiny">Against budget</span><b>{data.budget ? `${Math.round(budgetPct)}%` : "—"}</b>
                {data.budget > 0 && <div className={`meter ${budgetPct > 100 ? "over" : ""}`}><span style={{ width: `${Math.min(100, budgetPct)}%` }} /></div>}
                {data.budget > 0 && <span className="tiny">{budgetPct > 100 ? `${money.format(data.grandTotal - data.budget)} over` : `${money.format(data.budget - data.grandTotal)} remaining`}</span>}
              </div>
            </div>

            <div className="card">
              <div className="row between"><h3 style={{ margin: 0 }}>Cost breakdown</h3><button className="btn sm no-print" onClick={() => window.print()}>Print / save PDF</button></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Item</th><th>Type</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {e.lines.map((l, i) => (
                      <tr key={i}><td>{l.item}</td><td className="muted small">{l.group}</td><td className="num">{l.quantity} {l.unit}</td><td className="num">{money.format(l.unitCost)}</td><td className="num">{money.format(l.total)}</td></tr>
                    ))}
                    {e.lines.length === 0 && <tr><td colSpan={5} className="muted">No billable items yet.</td></tr>}
                  </tbody>
                  <tfoot>
                    <tr><td colSpan={4}>Materials · Labour · Services</td><td className="num">{money.format(e.totals.materials)} · {money.format(e.totals.labour)} · {money.format(e.totals.services)}</td></tr>
                    <tr><td colSpan={4}>Subtotal</td><td className="num">{money.format(e.totals.subtotal)}</td></tr>
                    <tr><td colSpan={4}>Contingency</td><td className="num">{money.format(e.totals.contingency)}</td></tr>
                    <tr><td colSpan={4}>VAT ({Math.round(catalog.vatRate * 100)}%)</td><td className="num">{money.format(e.totals.vat)}</td></tr>
                    <tr><td colSpan={4}>Total</td><td className="num">{money.format(e.totals.total)}</td></tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="grid cols-2">
              <div className="card">
                <h3>Material quantities</h3>
                <p className="tiny">Floor {e.geometry.floorArea} m² · walls {e.geometry.wallArea} m² · perimeter {e.geometry.perimeter} m</p>
                {e.quantities.map((q, i) => <div key={i} className="small" style={{ padding: "4px 0", borderBottom: "1px solid var(--line)" }}><b>{q.quantity} {q.unit}</b> {q.item}<div className="tiny">{q.note}</div></div>)}
              </div>
              <div className="card">
                <h3>Assumptions</h3>
                <ul className="small muted" style={{ paddingLeft: 18 }}>{e.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
