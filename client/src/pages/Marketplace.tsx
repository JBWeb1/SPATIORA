import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Modal, Stars } from "../components/ui";
import { useAuth, useCatalog, useMoney, useToast } from "../state";
import type { Product, Project } from "../types";

export default function Marketplace() {
  const catalog = useCatalog();
  const { user } = useAuth();
  const money = useMoney();
  const toast = useToast();
  const [params] = useSearchParams();
  const [filters, setFilters] = useState({ q: params.get("q") ?? "", category: "", style: "", maxPrice: 0, eco: false, local: false, sort: "relevance" });
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [target, setTarget] = useState(params.get("project") ?? "");
  const [compare, setCompare] = useState<Product[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const [watch, setWatch] = useState<{ product: Product; priceAtAdd: number }[]>([]);
  const watched = (id: string) => watch.some((w) => w.product.id === id);
  useEffect(() => { if (user) api.get<{ items: typeof watch }>("/watchlist").then((r) => setWatch(r.items)).catch(() => {}); }, [user]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleWatch = async (p: Product) => {
    try {
      const r = watched(p.id) ? await api.del<{ items: typeof watch }>(`/watchlist/${p.id}`) : await api.post<{ items: typeof watch }>("/watchlist", { productId: p.id });
      setWatch(r.items);
      if (!watched(p.id)) toast.info("Saved — we'll notify you if the price drops");
    } catch (err) { toast.error(err); }
  };

  useEffect(() => {
    const qs = new URLSearchParams();
    if (filters.q) qs.set("q", filters.q);
    if (filters.category) qs.set("category", filters.category);
    if (filters.style) qs.set("style", filters.style);
    if (filters.maxPrice) qs.set("maxPrice", String(money.toZar(filters.maxPrice)));
    if (filters.eco) qs.set("eco", "1");
    if (filters.local) qs.set("local", "1");
    qs.set("sort", filters.sort);
    const t = setTimeout(() => api.get<{ products: Product[]; categories: string[] }>(`/products?${qs}`).then((r) => { setProducts(r.products); setCategories(r.categories); }).catch(toast.error), 200);
    return () => clearTimeout(t);
  }, [filters, money, toast]);

  useEffect(() => {
    if (!user) return;
    api.get<{ projects: Project[] }>("/projects").then((r) => { setProjects(r.projects); if (!target && r.projects[0]) setTarget(r.projects[0].id); }).catch(() => {});
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (p: Product) => {
    if (!target) return toast.error(new Error("Create a project first to build a shopping list"));
    try { await api.post(`/projects/${target}/shopping`, { productId: p.id, quantity: 1 }); toast.info(`Added ${p.name}`); } catch (err) { toast.error(err); }
  };
  const toggleCompare = (p: Product) => setCompare((c) => (c.some((x) => x.id === p.id) ? c.filter((x) => x.id !== p.id) : [...c, p].slice(-3)));
  const styleName = (id: string) => catalog.styles.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="container">
      <div className="page-head">
        <div><h1>Product Marketplace</h1><p className="muted">Furniture, lighting, appliances, fixtures, materials and backup power from participating retailers.</p></div>
        {user && projects.length > 0 && (
          <label className="field">Add items to
            <select value={target} onChange={(e) => setTarget(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          </label>
        )}
      </div>
      <div className="card row" style={{ marginBottom: 16 }}>
        <input placeholder="Search products or retailers…" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} style={{ flex: 2, minWidth: 180 }} />
        <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })} style={{ width: 170 }}><option value="">All categories</option>{categories.map((c) => <option key={c}>{c}</option>)}</select>
        <select value={filters.style} onChange={(e) => setFilters({ ...filters, style: e.target.value })} style={{ width: 170 }}><option value="">Any style</option>{catalog.styles.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input type="number" min={0} placeholder={`Max price (${money.code})`} value={filters.maxPrice || ""} onChange={(e) => setFilters({ ...filters, maxPrice: Number(e.target.value) })} style={{ width: 150 }} />
        <select value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })} style={{ width: 150 }}>
          <option value="relevance">Relevance</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="rating">Top rated</option>
        </select>
        <label className="check"><input type="checkbox" checked={filters.eco} onChange={(e) => setFilters({ ...filters, eco: e.target.checked })} /> 🌿 Eco</label>
        <label className="check"><input type="checkbox" checked={filters.local} onChange={(e) => setFilters({ ...filters, local: e.target.checked })} /> 🇿🇦 Locally made</label>
      </div>

      {watch.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="row between"><h3 style={{ margin: 0 }}>♥ Saved items & price alerts</h3><span className="tiny">We notify you when a saved item drops 3% or more.</span></div>
          <div className="row" style={{ marginTop: 10, gap: 8 }}>
            {watch.map((w) => {
              const diff = w.product.price - w.priceAtAdd;
              return (
                <span key={w.product.id} className="chip" style={{ padding: "6px 10px" }}>
                  {w.product.name} · {money.format(w.product.price)}
                  {diff < 0 && <b style={{ color: "var(--good)" }}> ↓{money.format(-diff)}</b>}
                  {diff > 0 && <span style={{ color: "var(--ink-3)" }}> ↑{money.format(diff)}</span>}
                  <button className="btn ghost sm" style={{ padding: "0 4px" }} onClick={() => toggleWatch(w.product)} aria-label={`Remove ${w.product.name}`}>✕</button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {compare.length > 0 && (
        <div className="card row between" style={{ marginBottom: 16, background: "var(--accent-soft)" }}>
          <span className="small">Comparing: {compare.map((c) => c.name).join(" · ")}</span>
          <div className="row"><button className="btn sm accent" disabled={compare.length < 2} onClick={() => setShowCompare(true)}>Compare {compare.length}</button><button className="btn sm" onClick={() => setCompare([])}>Clear</button></div>
        </div>
      )}

      <div className="grid cols-4" style={{ paddingBottom: 40 }}>
        {products.map((p) => (
          <div key={p.id} className="card tight stack" style={{ gap: 8 }}>
            <div className="thumb" style={{ background: `linear-gradient(135deg, ${p.color}, color-mix(in srgb, ${p.color} 55%, #fff))`, display: "grid", placeItems: "center" }}>
              <span style={{ color: "#fff", fontSize: 13, textShadow: "0 1px 3px rgba(0,0,0,.5)" }}>{p.subcategory}</span>
              <span className="row badge-corner" style={{ gap: 4 }}>{p.ecoRated && <span className="chip good">🌿 Eco</span>}{p.localMade && <span className="chip">🇿🇦 Local</span>}</span>
            </div>
            <div>
              <b className="small">{p.name}</b>
              <div className="tiny">{p.retailer} · ships in {p.leadTimeDays} days</div>
              <Stars value={p.rating} />
            </div>
            <div className="row between"><b>{money.format(p.price)}</b><span className="tiny">{p.size.w}×{p.size.d}×{p.size.h} m</span></div>
            <div className="row" style={{ gap: 6 }}>
              {user ? <button className="btn sm primary grow" onClick={() => add(p)}>Add to list</button> : <Link to="/register" className="btn sm primary grow">Sign up to save</Link>}
              <button className={`btn sm ${compare.some((x) => x.id === p.id) ? "accent" : ""}`} onClick={() => toggleCompare(p)} title="Compare" aria-label="Compare">⇄</button>
              {user && <button className="btn sm" onClick={() => toggleWatch(p)} title={watched(p.id) ? "Saved — price alerts on" : "Save & get price-drop alerts"} aria-label="Save for price alerts" aria-pressed={watched(p.id)}>{watched(p.id) ? "♥" : "♡"}</button>}
            </div>
          </div>
        ))}
        {products.length === 0 && <div className="empty" style={{ gridColumn: "1 / -1" }}>No products match these filters.</div>}
      </div>

      {showCompare && (
        <Modal title="Compare products" onClose={() => setShowCompare(false)} wide>
          <div className="table-wrap"><table className="table">
            <tbody>
              {([
                ["Product", (p: Product) => <b>{p.name}</b>],
                ["Price", (p: Product) => money.format(p.price)],
                ["Retailer", (p: Product) => p.retailer],
                ["Rating", (p: Product) => <Stars value={p.rating} />],
                ["Size (W×D×H)", (p: Product) => `${p.size.w} × ${p.size.d} × ${p.size.h} m`],
                ["Lead time", (p: Product) => `${p.leadTimeDays} days`],
                ["Styles", (p: Product) => p.styles.map(styleName).join(", ") || "—"],
                ["Eco-rated", (p: Product) => (p.ecoRated ? "Yes" : "—")],
                ["Locally made", (p: Product) => (p.localMade ? "Yes" : "—")],
              ] as const).map(([label, render]) => (
                <tr key={label}><th>{label}</th>{compare.map((p) => <td key={p.id}>{render(p)}</td>)}</tr>
              ))}
            </tbody>
          </table></div>
        </Modal>
      )}
    </div>
  );
}
