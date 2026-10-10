import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { api, errorMessage } from "../api";
import { Logo } from "../components/ui";
import { useAuth, useCatalog, useMoney } from "../state";
import type { Estimate } from "../types";

const FEATURES = [
  ["✦", "AI Interior Designer", "Turn a photo of your room into realistic redesigns in any style — while keeping your real layout."],
  ["⌂", "Room Design Studio", "Living rooms, kitchens, bathrooms, bedrooms or the whole home, with unlimited variations to compare."],
  ["▣", "3D Home Builder", "Set your room's dimensions, drag real furniture onto the plan and walk around it in 3D."],
  ["◧", "Material Editor", "Swap flooring, paint, tiles, countertops and cabinets individually and see them update instantly."],
  ["✎", "AI Design Assistant", "Photo-aware advice on layouts, palettes, lighting and materials, tuned to South African homes."],
  ["R", "Renovation Calculator", "Quantities, labour and VAT-inclusive costs in rand — or any of 9 currencies — for your exact room."],
  ["⚡", "Load-shedding & Solar Planner", "Size an inverter, battery and solar array for your home, with cost and payback estimates."],
  ["🛒", "Product Marketplace", "Shop real furniture, fixtures and materials, compare prices and build a shopping list per project."],
  ["◷", "Renovation Planner", "Auto-generated timelines with phases, a Gantt view and estimate-vs-actual budget tracking."],
  ["👷", "Contractor Connect", "Find verified local trades by province and send them a ready-made project brief."],
  ["◎", "Share & Collaborate", "Share a read-only link; family and clients vote and comment on each concept."],
  ["▤", "Professional Workspace", "Clients, branded quotations with markup and VAT, and presentation-ready project pages."],
];

const STEPS = [
  ["Upload a room", "Snap a photo of any room — or start from a blank room or floor plan."],
  ["Choose a design", "Pick a style, colours, materials, furniture, lighting and your budget."],
  ["Let AI redesign it", "Generate multiple realistic concepts and compare before and after."],
  ["Edit in 3D", "Move furniture, change finishes and lighting in an editable 3D room."],
  ["Plan the renovation", "Get quantities, costs, products and a timeline your contractor can use."],
  ["Save, share & build", "Keep versions, share with family or clients, and bring it to life."],
];

function QuickEstimate() {
  const catalog = useCatalog();
  const money = useMoney("ZAR");
  const [form, setForm] = useState({ length: 5, width: 4, flooring: "floor-vinyl", quality: "standard", province: "Gauteng" });
  const [result, setResult] = useState<Estimate | null>(null);
  const [err, setErr] = useState("");
  const run = async () => {
    try {
      setErr("");
      const r = await api.post<{ estimate: Estimate }>("/estimate/quick", { ...form });
      setResult(r.estimate);
    } catch (e) { setErr(errorMessage(e)); }
  };
  return (
    <div className="card">
      <h3>Try the renovation calculator</h3>
      <p className="muted small">Floor, skirting, walls and ceiling for a single room — VAT included.</p>
      <div className="form-grid">
        <label className="field">Length (m)<input type="number" min={1} step={0.1} value={form.length} onChange={(e) => setForm({ ...form, length: Number(e.target.value) })} /></label>
        <label className="field">Width (m)<input type="number" min={1} step={0.1} value={form.width} onChange={(e) => setForm({ ...form, width: Number(e.target.value) })} /></label>
        <label className="field">Flooring
          <select value={form.flooring} onChange={(e) => setForm({ ...form, flooring: e.target.value })}>
            {catalog.materials.filter((m) => m.category === "flooring").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="field">Province
          <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })}>
            {catalog.provinces.map((p) => <option key={p.name}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={run}>Estimate</button>
        {result && <span><b style={{ fontSize: 20 }}>{money.format(result.range.low)} – {money.format(result.range.high)}</b> <span className="muted small">for {result.geometry.floorArea} m²</span></span>}
        {err && <span className="chip bad">{err}</span>}
      </div>
    </div>
  );
}

export default function Landing() {
  const { user } = useAuth();
  const catalog = useCatalog();
  if (user) return <Navigate to="/app" replace />;
  return (
    <>
      <section className="container hero">
        <div>
          <span className="chip accent">AI interior design & renovation · South Africa</span>
          <h1 style={{ marginTop: 14 }}>See the space.<br />Shape the future.</h1>
          <p className="muted" style={{ fontSize: 18, maxWidth: 560 }}>
            VISTORA brings AI redesigns, 3D room editing, material selection, renovation costing, product shopping and contractor planning into one place — simple for homeowners, powerful for professionals.
          </p>
          <div className="row" style={{ marginTop: 20 }}>
            <Link to="/register" className="btn primary lg">Redesign a room free</Link>
            <a href="#how" className="btn lg">How it works</a>
          </div>
          <p className="tiny" style={{ marginTop: 12 }}>{catalog.plans.free.monthlyGenerations} free AI redesigns every month · No card required</p>
        </div>
        <div className="hero-art"><Logo size={300} color="#ffffff" bg="#262626" /></div>
      </section>

      <section id="how" className="container section">
        <h2>From photo to finished room in six steps</h2>
        <div className="grid cols-3 steps" style={{ marginTop: 16 }}>
          {STEPS.map(([t, d]) => <div key={t} className="card"><h3>{t}</h3><p className="muted small">{d}</p></div>)}
        </div>
      </section>

      <section id="features" className="container section">
        <h2>Everything in one platform</h2>
        <p className="muted">No more juggling one app for AI images, another for 3D, another for shopping and a spreadsheet for costs.</p>
        <div className="grid cols-3" style={{ marginTop: 16 }}>
          {FEATURES.map(([icon, t, d]) => (
            <div key={t} className="card feature"><div className="icon">{icon}</div><h3 style={{ margin: 0 }}>{t}</h3><p className="muted small" style={{ margin: 0 }}>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="container section">
        <div className="grid cols-2">
          <QuickEstimate />
          <div className="card">
            <h3>{catalog.styles.length} curated design styles</h3>
            <div className="grid cols-2" style={{ gap: 10 }}>
              {catalog.styles.map((s) => (
                <div key={s.id} className="row" style={{ gap: 8 }}>
                  <div className="swatches">{s.palette.slice(0, 4).map((c) => <span key={c} className="swatch" style={{ background: c, width: 16, height: 16 }} />)}</div>
                  <span className="small">{s.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="container section">
        <h2>Plans</h2>
        <div className="grid cols-3" style={{ marginTop: 16 }}>
          {(["free", "premium", "pro"] as const).map((id) => {
            const p = catalog.plans[id];
            return (
              <div key={id} className={`card price-card ${id === "premium" ? "featured" : ""}`}>
                <h3>{p.name}</h3>
                <div className="price">{p.priceZar ? `R${p.priceZar}` : "R0"}<span className="small muted"> /month</span></div>
                <ul className="small muted">
                  <li>{p.monthlyGenerations} AI redesigns / month</li>
                  <li>{p.maxProjects >= 1000 ? "Unlimited" : p.maxProjects} projects</li>
                  <li>3D studio, calculator & energy planner</li>
                  {p.hdRenders && <li>High-resolution render downloads</li>}
                  {p.workspace && <li>Clients, quotations & presentations</li>}
                  {id !== "free" && <li>Marketplace & contractor tools</li>}
                </ul>
                <Link to="/register" className={`btn block ${id === "premium" ? "accent" : ""}`}>Get started</Link>
              </div>
            );
          })}
        </div>
        <p className="tiny" style={{ marginTop: 10 }}>VISTORA also earns marketplace commission from participating retailers and offers business services for designers, architects, contractors and developers.</p>
      </section>
    </>
  );
}
