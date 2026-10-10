import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth, useCatalog, useMoney, useToast } from "../state";
import type { Appliance, ShoppingItem } from "../types";
import type { TabProps } from "./context";

interface EnergyPlan {
  sunHours: number; dailyKwh: number; monthlyKwh: number; monthlyBill: number; essentialPeakW: number; backupKwh: number;
  system: { inverterKva: number; batteryKwh: number; panels: number; solarKwp: number; solarDailyKwh: number };
  cost: { inverter: number; battery: number; panels: number; installation: number; total: number };
  monthlySavings: number; paybackYears: number | null; co2SavedKgPerYear: number; tips: string[];
}

export default function EnergyTab({ bundle, setBundle }: TabProps) {
  const catalog = useCatalog();
  const { user } = useAuth();
  const money = useMoney();
  const toast = useToast();
  const [appliances, setAppliances] = useState<Appliance[]>(catalog.defaultAppliances);
  const [cfg, setCfg] = useState({ province: user?.province ?? "Gauteng", loadsheddingHours: 4, tariff: 3.5, wantSolar: true });
  const [plan, setPlan] = useState<EnergyPlan | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api.post<{ plan: EnergyPlan }>("/energy/plan", { ...cfg, appliances }).then((r) => setPlan(r.plan)).catch(toast.error);
    }, 300);
    return () => clearTimeout(t);
  }, [appliances, cfg, toast]);

  const edit = (i: number, patch: Partial<Appliance>) => setAppliances(appliances.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  const addSystemToList = async () => {
    if (!plan) return;
    const batteries = Math.ceil(plan.system.batteryKwh / 5.12);
    const inverters = Math.ceil(plan.system.inverterKva / 5);
    try {
      let shopping: ShoppingItem[] = [];
      for (const [productId, quantity] of [["p-en-inverter", inverters], ["p-en-battery", batteries], ["p-en-panel", plan.system.panels]] as const) {
        if (quantity > 0) shopping = (await api.post<{ shopping: ShoppingItem[] }>(`/projects/${bundle.project.id}/shopping`, { productId, quantity })).shopping;
      }
      setBundle((b) => ({ ...b, shopping }));
      toast.info("Backup power system added to your shopping list");
    } catch (err) { toast.error(err); }
  };

  return (
    <div className="split">
      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Load-shedding & solar planner</h3>
          <p className="small muted" style={{ margin: 0 }}>Size backup power and solar for this home, then add it to your renovation.</p>
          <label className="field">Province
            <select value={cfg.province} onChange={(e) => setCfg({ ...cfg, province: e.target.value })}>{catalog.provinces.map((p) => <option key={p.name}>{p.name}</option>)}</select>
          </label>
          <label className="field">Longest outage to ride through: {cfg.loadsheddingHours} h
            <input type="range" min={1} max={12} step={0.5} value={cfg.loadsheddingHours} onChange={(e) => setCfg({ ...cfg, loadsheddingHours: Number(e.target.value) })} />
          </label>
          <label className="field">Electricity tariff (R/kWh)<input type="number" min={0.5} max={20} step={0.1} value={cfg.tariff} onChange={(e) => setCfg({ ...cfg, tariff: Number(e.target.value) })} /></label>
          <label className="check"><input type="checkbox" checked={cfg.wantSolar} onChange={(e) => setCfg({ ...cfg, wantSolar: e.target.checked })} /> Include rooftop solar</label>
        </div>
        {plan && (
          <div className="card stack">
            <h3 style={{ margin: 0 }}>Recommended system</h3>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="stat"><span className="tiny">Inverter</span><b>{plan.system.inverterKva} kVA</b></div>
              <div className="stat"><span className="tiny">Battery</span><b>{plan.system.batteryKwh} kWh</b></div>
              <div className="stat"><span className="tiny">Solar</span><b>{plan.system.panels} × 550W</b><span className="tiny">{plan.system.solarKwp} kWp</span></div>
              <div className="stat"><span className="tiny">Installed cost</span><b>{money.format(plan.cost.total)}</b></div>
            </div>
            <div className="small">Saves ≈ <b>{money.format(plan.monthlySavings)}/month</b>{plan.paybackYears && <> · payback ≈ <b>{plan.paybackYears} years</b></>} · {plan.co2SavedKgPerYear.toLocaleString()} kg CO₂/yr avoided</div>
            <div className="row"><button className="btn accent sm" onClick={addSystemToList}>Add to shopping list</button><Link className="btn sm" to="/contractors?trade=Solar%20%26%20backup%20power">Find an installer</Link></div>
          </div>
        )}
      </div>
      <div className="stack">
        <div className="card">
          <div className="row between"><h3 style={{ margin: 0 }}>Appliances</h3><button className="btn sm" onClick={() => setAppliances([...appliances, { name: "New appliance", watts: 100, hoursPerDay: 2, quantity: 1, essential: false }])}>+ Add</button></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Appliance</th><th className="num">Watts</th><th className="num">Hours/day</th><th className="num">Qty</th><th>Backup</th><th /></tr></thead>
            <tbody>
              {appliances.map((a, i) => (
                <tr key={i}>
                  <td><input value={a.name} onChange={(e) => edit(i, { name: e.target.value })} style={{ padding: "4px 6px" }} /></td>
                  <td><input type="number" min={0} value={a.watts} onChange={(e) => edit(i, { watts: Number(e.target.value) })} style={{ width: 80, padding: "4px 6px" }} /></td>
                  <td><input type="number" min={0} max={24} step={0.5} value={a.hoursPerDay} onChange={(e) => edit(i, { hoursPerDay: Number(e.target.value) })} style={{ width: 70, padding: "4px 6px" }} /></td>
                  <td><input type="number" min={0} value={a.quantity} onChange={(e) => edit(i, { quantity: Math.round(Number(e.target.value)) })} style={{ width: 60, padding: "4px 6px" }} /></td>
                  <td><input type="checkbox" checked={a.essential} onChange={(e) => edit(i, { essential: e.target.checked })} aria-label="On backup circuit" /></td>
                  <td><button className="btn ghost sm" onClick={() => setAppliances(appliances.filter((_, j) => j !== i))} aria-label="Remove">✕</button></td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {plan && <p className="small muted">Usage ≈ {plan.dailyKwh} kWh/day ({plan.monthlyKwh} kWh/month, ≈ {money.format(plan.monthlyBill)}). Essential peak load {plan.essentialPeakW} W; {plan.backupKwh} kWh needed per outage. Peak sun: {plan.sunHours} h/day.</p>}
        </div>
        {plan && <div className="card"><h3>Energy-saving tips</h3><ul className="small" style={{ paddingLeft: 18 }}>{plan.tips.map((t) => <li key={t}>{t}</li>)}</ul></div>}
      </div>
    </div>
  );
}
