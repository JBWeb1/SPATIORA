import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../state";
import type { Product, Project } from "../types";

interface Item { id: string; icon: string; label: string; hint: string; to: string }

const PAGES: Item[] = [
  { id: "p-app", icon: "⌂", label: "Projects", hint: "Page", to: "/app" },
  { id: "p-market", icon: "🛒", label: "Marketplace", hint: "Page", to: "/marketplace" },
  { id: "p-contractors", icon: "👷", label: "Find contractors", hint: "Page", to: "/contractors" },
  { id: "p-quiz", icon: "✦", label: "Style DNA quiz", hint: "Page", to: "/style-quiz?retake=1" },
  { id: "p-work", icon: "▤", label: "Pro Workspace — quotes & clients", hint: "Page", to: "/workspace" },
  { id: "p-account", icon: "⚙", label: "Account, plan & updates", hint: "Page", to: "/account" },
];
const PROJECT_TABS = [["redesign", "AI Redesign"], ["studio", "3D Studio"], ["tidy", "Tidy & organise"], ["house", "Whole house"], ["estimate", "Estimate"], ["planner", "Planner"], ["share", "Share & brief"]];

/** Quick search / jump anywhere: Ctrl+K or ⌘K. */
export default function CommandPalette() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("vistora:palette", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("vistora:palette", onOpen); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ(""); setSel(0);
    api.get<{ projects: Project[] }>("/projects").then((r) => setProjects(r.projects)).catch(() => {});
    api.get<{ products: Product[] }>("/products").then((r) => setProducts(r.products)).catch(() => {});
  }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const match = (s: string) => !term || s.toLowerCase().includes(term);
    const items: Item[] = [];
    for (const p of projects) {
      if (match(`${p.name} ${p.roomType}`)) {
        items.push({ id: `pr-${p.id}`, icon: "◫", label: p.name, hint: `Project · ${p.roomType}`, to: `/projects/${p.id}` });
        if (term) for (const [tab, label] of PROJECT_TABS) items.push({ id: `pr-${p.id}-${tab}`, icon: "↳", label: `${p.name} → ${label}`, hint: "Project tab", to: `/projects/${p.id}?tab=${tab}` });
      }
    }
    items.push(...PAGES.filter((p) => match(p.label)));
    if (user?.isAdmin && match("admin dashboard business")) items.push({ id: "p-admin", icon: "📊", label: "Admin dashboard", hint: "Page", to: "/admin" });
    if (term) items.push(...products.filter((p) => match(`${p.name} ${p.subcategory} ${p.retailer}`)).slice(0, 8)
      .map((p) => ({ id: `prod-${p.id}`, icon: "🏷", label: p.name, hint: `Product · ${p.retailer}`, to: `/marketplace?q=${encodeURIComponent(p.name)}` })));
    return items.slice(0, 40);
  }, [q, projects, products, user]);

  if (!open) return null;
  const go = (item?: Item) => { if (!item) return; setOpen(false); nav(item.to); };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)} style={{ alignItems: "start", paddingTop: "12vh" }}>
      <div className="modal palette" role="dialog" aria-label="Quick search">
        <input
          ref={inputRef}
          autoFocus
          placeholder="Search projects, pages and products…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setSel(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
            if (e.key === "Enter") go(results[sel]);
            if (e.key === "Escape") setOpen(false);
          }}
          aria-label="Search"
        />
        <div className="palette-list">
          {results.length === 0 && <p className="muted small" style={{ padding: 12 }}>No matches.</p>}
          {results.map((r, i) => (
            <button key={r.id} className={`palette-item ${i === sel ? "on" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
              <span style={{ width: 20, textAlign: "center" }}>{r.icon}</span>
              <span className="grow">{r.label}</span>
              <span className="tiny">{r.hint}</span>
            </button>
          ))}
        </div>
        <div className="row tiny" style={{ padding: "8px 14px", borderTop: "1px solid var(--line)" }}>
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> navigate</span><span><span className="kbd">Enter</span> open</span><span><span className="kbd">Esc</span> close</span>
        </div>
      </div>
    </div>
  );
}
