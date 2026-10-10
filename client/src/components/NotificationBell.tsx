import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { AppNotification } from "../types";
import { fmtDate } from "./ui";

const ICON: Record<AppNotification["kind"], string> = { comment: "💬", "price-drop": "🏷️", quote: "📄", contractor: "👷", system: "✦" };

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const nav = useNavigate();

  const load = useCallback(() => {
    api.get<{ unread: number; notifications: AppNotification[] }>("/notifications").then((r) => { setItems(r.notifications); setUnread(r.unread); }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 45_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const markAll = async () => { await api.post("/notifications/read", {}); setUnread(0); setItems((i) => i.map((n) => ({ ...n, read: true }))); };
  const openItem = async (n: AppNotification) => {
    if (!n.read) { api.post("/notifications/read", { ids: [n.id] }).catch(() => {}); setUnread((u) => Math.max(0, u - 1)); setItems((i) => i.map((x) => (x.id === n.id ? { ...x, read: true } : x))); }
    setOpen(false);
    if (n.link) nav(n.link);
  };

  return (
    <div className="bell" ref={ref}>
      <button className="btn ghost sm" onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`} aria-expanded={open}>
        🔔{unread > 0 && <span className="bell-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notifications">
          <div className="row between" style={{ padding: "10px 12px", borderBottom: "1px solid var(--line)" }}>
            <b>Notifications</b>
            {unread > 0 && <button className="btn ghost sm" onClick={markAll}>Mark all read</button>}
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            {items.length === 0 && <p className="muted small" style={{ padding: 14, margin: 0 }}>You're all caught up. Comments on shared projects, price drops on saved products and quote updates appear here.</p>}
            {items.map((n) => (
              <button key={n.id} className={`bell-item ${n.read ? "" : "unread"}`} onClick={() => openItem(n)}>
                <span style={{ fontSize: 18 }}>{ICON[n.kind] ?? "✦"}</span>
                <span className="grow" style={{ textAlign: "left" }}>
                  <span className="small" style={{ fontWeight: n.read ? 400 : 600, display: "block" }}>{n.title}</span>
                  {n.body && <span className="tiny" style={{ display: "block" }}>{n.body}</span>}
                  <span className="tiny">{fmtDate(n.createdAt, true)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
