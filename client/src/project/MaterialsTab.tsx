import { useState } from "react";
import { useCatalog, useMoney, useToast } from "../state";
import type { Finishes, Material } from "../types";
import type { TabProps } from "./context";

const CATS: { key: Material["category"]; label: string; qty?: { field: string; label: string; unit: string } }[] = [
  { key: "flooring", label: "Flooring" },
  { key: "wall", label: "Walls" },
  { key: "ceiling", label: "Ceiling" },
  { key: "tiles", label: "Tiles (splashback / shower)", qty: { field: "tiledArea", label: "Tiled wall area", unit: "m²" } },
  { key: "countertop", label: "Countertops", qty: { field: "countertopLength", label: "Countertop length", unit: "lm" } },
  { key: "cabinetry", label: "Cabinetry", qty: { field: "cabinetryLength", label: "Cabinet run", unit: "lm" } },
];

// Material picks that suit each style (falls back to sensible neutrals).
const STYLE_KITS: Record<string, Partial<Record<Material["category"], string>>> = {
  "modern-luxury": { flooring: "floor-porcelain", wall: "wall-greige", ceiling: "ceiling-white", tiles: "tiles-marble", countertop: "counter-marble", cabinetry: "cab-navy" },
  minimalist: { flooring: "floor-microcement", wall: "wall-white", ceiling: "ceiling-white", tiles: "tiles-subway", countertop: "counter-quartz", cabinetry: "cab-white-shaker" },
  scandinavian: { flooring: "floor-oak", wall: "wall-white", ceiling: "ceiling-white", tiles: "tiles-subway", countertop: "counter-butcher", cabinetry: "cab-oak-flat" },
  industrial: { flooring: "floor-microcement", wall: "wall-charcoal", ceiling: "ceiling-white", tiles: "tiles-subway", countertop: "counter-granite", cabinetry: "cab-navy" },
  contemporary: { flooring: "floor-porcelain", wall: "wall-greige", ceiling: "ceiling-white", tiles: "tiles-marble", countertop: "counter-quartz", cabinetry: "cab-oak-flat" },
  farmhouse: { flooring: "floor-oak", wall: "wall-white", ceiling: "ceiling-timber", tiles: "tiles-subway", countertop: "counter-butcher", cabinetry: "cab-sage" },
  "afro-modern": { flooring: "floor-oak", wall: "wall-terracotta", ceiling: "ceiling-timber", tiles: "tiles-terracotta", countertop: "counter-granite", cabinetry: "cab-oak-flat" },
  coastal: { flooring: "floor-vinyl", wall: "wall-white", ceiling: "ceiling-white", tiles: "tiles-zellige", countertop: "counter-quartz", cabinetry: "cab-white-shaker" },
  japandi: { flooring: "floor-oak", wall: "wall-greige", ceiling: "ceiling-timber", tiles: "tiles-subway", countertop: "counter-quartz", cabinetry: "cab-oak-flat" },
  "mid-century": { flooring: "floor-oak", wall: "wall-sage", ceiling: "ceiling-white", tiles: "tiles-zellige", countertop: "counter-butcher", cabinetry: "cab-oak-flat" },
};

function RoomPreview({ f, materials }: { f: Finishes; materials: Material[] }) {
  const c = (id: unknown, fallback: string) => materials.find((m) => m.id === id)?.color ?? fallback;
  const wall = c(f.wall, "#efebe4"), floor = c(f.flooring, "#b9a58a"), ceil = c(f.ceiling, "#fbfbf8");
  const tiles = c(f.tiles, ""), counter = c(f.countertop, ""), cab = c(f.cabinetry, "");
  return (
    <svg viewBox="0 0 400 300" style={{ width: "100%", borderRadius: 12, background: wall }} aria-label="Finish preview">
      <polygon points="0,0 400,0 340,50 60,50" fill={ceil} />
      <polygon points="0,0 60,50 60,230 0,300" fill={wall} style={{ filter: "brightness(.9)" }} />
      <polygon points="400,0 340,50 340,230 400,300" fill={wall} style={{ filter: "brightness(.93)" }} />
      <rect x={60} y={50} width={280} height={180} fill={wall} />
      <polygon points="0,300 60,230 340,230 400,300" fill={floor} />
      {[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1={60 + i * 56} y1={230} x2={i * 80} y2={300} stroke="rgba(0,0,0,.08)" />)}
      {tiles && <g>{Array.from({ length: 28 }, (_, i) => <rect key={i} x={110 + (i % 7) * 26 + (Math.floor(i / 7) % 2) * 13} y={120 + Math.floor(i / 7) * 13} width={25} height={12} fill={tiles} stroke="rgba(0,0,0,.12)" strokeWidth={0.8} />)}</g>}
      {cab && <rect x={100} y={175} width={200} height={55} fill={cab} stroke="rgba(0,0,0,.2)" />}
      {cab && [0, 1, 2, 3].map((i) => <line key={i} x1={100 + i * 50} y1={175} x2={100 + i * 50} y2={230} stroke="rgba(0,0,0,.25)" />)}
      {counter && <rect x={96} y={168} width={208} height={8} fill={counter} stroke="rgba(0,0,0,.2)" />}
      {cab && <rect x={110} y={70} width={180} height={40} fill={cab} stroke="rgba(0,0,0,.2)" />}
      <rect x={250} y={65} width={70} height={60} fill="#d9ecf5" stroke="rgba(0,0,0,.2)" />
    </svg>
  );
}

export default function MaterialsTab({ bundle, save }: TabProps) {
  const catalog = useCatalog();
  const money = useMoney();
  const toast = useToast();
  const p = bundle.project;
  const [f, setF] = useState<Finishes>(p.finishes);
  const geo = { floor: p.room.length * p.room.width, wall: Math.max(0, 2 * (p.room.length + p.room.width) * p.room.height - p.room.doors * 1.9 - p.room.windows * 1.5) };

  const pick = async (next: Finishes) => {
    setF(next);
    try { await save({ finishes: next }); } catch { /* toast shown by save */ }
  };
  const applyKit = () => {
    const kit = STYLE_KITS[(f.style as string) ?? ""] ?? STYLE_KITS.contemporary;
    pick({ ...f, ...kit });
    toast.info("Applied the style's material kit");
  };

  const roughCost = (m: Material) => {
    if (m.category === "flooring") return m.price * geo.floor * 1.1;
    if (m.category === "wall") return (m.price * geo.wall * 2) / 10;
    if (m.category === "ceiling") return m.unit === "m2" ? m.price * geo.floor : (m.price * geo.floor * 2) / 10;
    const q = Number(f[CATS.find((c) => c.key === m.category)?.qty?.field ?? ""] ?? 0);
    return m.price * q;
  };

  return (
    <div className="split">
      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Live preview</h3>
          <RoomPreview f={f} materials={catalog.materials} />
          <div className="row">
            <select value={(f.style as string) ?? ""} onChange={(e) => pick({ ...f, style: e.target.value || null })} style={{ flex: 1 }}>
              <option value="">No style selected</option>
              {catalog.styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn accent sm" onClick={applyKit}>Apply style kit</button>
          </div>
          <p className="tiny" style={{ margin: 0 }}>Finishes flow through to the 3D Studio, the Renovation Calculator and your contractor brief.</p>
        </div>
      </div>
      <div className="stack">
        {CATS.map((cat) => {
          const options = catalog.materials.filter((m) => m.category === cat.key);
          return (
            <div key={cat.key} className="card">
              <div className="row between">
                <h3 style={{ margin: 0 }}>{cat.label}</h3>
                {f[cat.key] && <button className="btn ghost sm" onClick={() => pick({ ...f, [cat.key]: null })}>Clear</button>}
              </div>
              <div className="grid cols-4" style={{ marginTop: 10, gap: 8 }}>
                {options.map((m) => (
                  <button key={m.id} className={`style-card ${f[cat.key] === m.id ? "on" : ""}`} onClick={() => pick({ ...f, [cat.key]: m.id })}>
                    <div style={{ height: 44, borderRadius: 8, background: m.color, border: "1px solid rgba(0,0,0,.1)" }} />
                    <span className="small"><b>{m.name}</b></span>
                    <span className="tiny">{money.format(m.price)}/{m.unit === "m2" ? "m²" : m.unit} · ≈ {money.format(roughCost(m))}</span>
                  </button>
                ))}
              </div>
              {cat.qty && (
                <label className="field" style={{ marginTop: 10, maxWidth: 220 }}>{cat.qty.label} ({cat.qty.unit})
                  <input type="number" min={0} step={0.1} value={Number(f[cat.qty.field] ?? 0)} onChange={(e) => setF({ ...f, [cat.qty!.field]: Number(e.target.value) })} onBlur={() => pick(f)} />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
