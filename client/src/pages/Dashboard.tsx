import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Modal } from "../components/ui";
import { useAuth, useCatalog, useMoney, useToast } from "../state";
import type { Client, Project } from "../types";

interface DashboardData {
  stats: { projects: number; designs: number; favorites: number; budget: number };
  usage: { used: number; allowance: number };
  recentComments: { authorName: string; body: string; createdAt: string; projectName: string; projectId: string }[];
  openTasks: { title: string; endDate: string | null; projectName: string; projectId: string }[];
}

export const STATUS_LABEL: Record<Project["status"], string> = {
  planning: "Planning", designing: "Designing", quoting: "Quoting", "in-progress": "In progress", complete: "Complete",
};

function NewProject({ onClose }: { onClose: () => void }) {
  const catalog = useCatalog();
  const { user } = useAuth();
  const money = useMoney();
  const nav = useNavigate();
  const toast = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [form, setForm] = useState({
    name: "", roomType: "Living room", budget: 0, length: 5, width: 4, height: 2.7, clientId: "",
    style: user?.styleProfile?.primary ?? "",
  });
  useEffect(() => {
    if (user?.planDetails.workspace) api.get<{ clients: Client[] }>("/clients").then((r) => setClients(r.clients)).catch(() => {});
  }, [user]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const r = await api.post<{ project: Project }>("/projects", {
        name: form.name || `${form.roomType} redesign`, roomType: form.roomType, budget: money.toZar(form.budget),
        room: { length: form.length, width: form.width, height: form.height },
        clientId: form.clientId || undefined, style: form.style || undefined,
      });
      nav(`/projects/${r.project.id}`);
    } catch (err) { toast.error(err); }
  };
  return (
    <Modal title="New project" onClose={onClose}>
      <form className="stack" onSubmit={submit}>
        <label className="field">Project name<input autoFocus placeholder="e.g. Sea Point lounge makeover" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <div className="form-grid">
          <label className="field">Room type
            <select value={form.roomType} onChange={(e) => setForm({ ...form, roomType: e.target.value })}>{catalog.roomTypes.map((r) => <option key={r}>{r}</option>)}</select>
          </label>
          <label className="field">Budget ({money.code})<input type="number" min={0} step={1000} value={form.budget || ""} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} /></label>
        </div>
        <div className="form-grid">
          <label className="field">Length (m)<input type="number" min={1} max={40} step={0.1} value={form.length} onChange={(e) => setForm({ ...form, length: Number(e.target.value) })} /></label>
          <label className="field">Width (m)<input type="number" min={1} max={40} step={0.1} value={form.width} onChange={(e) => setForm({ ...form, width: Number(e.target.value) })} /></label>
          <label className="field">Ceiling (m)<input type="number" min={2} max={8} step={0.1} value={form.height} onChange={(e) => setForm({ ...form, height: Number(e.target.value) })} /></label>
        </div>
        <label className="field">Starting style
          <select value={form.style} onChange={(e) => setForm({ ...form, style: e.target.value })}>
            <option value="">Decide later</option>
            {catalog.styles.map((s) => <option key={s.id} value={s.id}>{s.name}{user?.styleProfile?.primary === s.id ? " (your Style DNA)" : ""}</option>)}
          </select>
        </label>
        {clients.length > 0 && (
          <label className="field">Client
            <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
              <option value="">Personal project</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <button className="btn primary">Create project</button>
      </form>
    </Modal>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const money = useMoney();
  const toast = useToast();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    api.get<{ projects: Project[] }>("/projects").then((r) => setProjects(r.projects)).catch(toast.error);
    api.get<DashboardData>("/dashboard").then(setData).catch(() => {});
  }, [toast]);

  const filtered = useMemo(() => (projects ?? []).filter((p) =>
    (!q || `${p.name} ${p.roomType} ${p.tags.join(" ")}`.toLowerCase().includes(q.toLowerCase())) && (!status || p.status === status)), [projects, q, status]);

  const usagePct = data ? Math.min(100, (data.usage.used / data.usage.allowance) * 100) : 0;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Hi {user?.name.split(" ")[0]} 👋</h1>
          <p className="muted">Your Project Library — every room, concept and plan in one place.</p>
        </div>
        <button className="btn primary lg" onClick={() => setCreating(true)}>+ New project</button>
      </div>

      {data && (
        <div className="grid cols-4" style={{ marginBottom: 20 }}>
          <div className="card stat"><span className="tiny">Projects</span><b>{data.stats.projects}</b></div>
          <div className="card stat"><span className="tiny">AI concepts</span><b>{data.stats.designs}</b><span className="tiny">{data.stats.favorites} favourites</span></div>
          <div className="card stat"><span className="tiny">Total budgets</span><b>{money.format(data.stats.budget)}</b></div>
          <div className="card stat">
            <span className="tiny">AI redesigns this month ({user?.planDetails.name})</span>
            <b>{data.usage.used} / {data.usage.allowance}</b>
            <div className={`meter ${usagePct >= 100 ? "over" : ""}`}><span style={{ width: `${usagePct}%` }} /></div>
            {user?.plan === "free" && <Link to="/account" className="tiny">Upgrade for more →</Link>}
          </div>
        </div>
      )}

      {!user?.styleProfile && (
        <div className="card row between" style={{ marginBottom: 20, background: "var(--accent-soft)" }}>
          <div><b>Discover your Style DNA</b><div className="small muted">A 60-second quiz that personalises styles, palettes and product picks.</div></div>
          <Link to="/style-quiz" className="btn accent">Take the quiz</Link>
        </div>
      )}

      <div className="row" style={{ marginBottom: 14 }}>
        <input placeholder="Search projects, rooms or tags…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 340 }} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ maxWidth: 180 }}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {projects === null ? <p className="muted">Loading projects…</p> : filtered.length === 0 ? (
        <div className="empty">
          <h3>{projects.length ? "No projects match your filters" : "Start your first project"}</h3>
          <p>Upload a photo of a room, pick a style and let VISTORA redesign it.</p>
          {!projects.length && <button className="btn primary" onClick={() => setCreating(true)}>Create a project</button>}
        </div>
      ) : (
        <div className="grid cols-3">
          {filtered.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="card project-card tight">
              <div className="thumb">
                {p.coverImage ? <img src={p.coverImage} alt="" loading="lazy" /> : <div style={{ display: "grid", placeItems: "center", height: "100%", fontSize: 40, opacity: .3 }}>⌂</div>}
                <span className="chip badge-corner">{STATUS_LABEL[p.status]}</span>
              </div>
              <div>
                <h3 style={{ margin: 0 }}>{p.name}</h3>
                <div className="row between small muted">
                  <span>{p.roomType} · {p.designCount ?? 0} concepts</span>
                  {p.budget > 0 && <span>{money.format(p.budget)}</span>}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {data && (data.openTasks.length > 0 || data.recentComments.length > 0) && (
        <div className="grid cols-2 section">
          <div className="card">
            <h3>Upcoming tasks</h3>
            {data.openTasks.length === 0 ? <p className="muted small">Nothing scheduled.</p> : data.openTasks.map((t, i) => (
              <div key={i} className="row between small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <span>{t.title} <Link to={`/projects/${t.projectId}`} className="muted">· {t.projectName}</Link></span>
                <span className="muted">{t.endDate ?? "—"}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <h3>Feedback from shared links</h3>
            {data.recentComments.length === 0 ? <p className="muted small">No feedback yet — share a project to collect comments.</p> : data.recentComments.map((c, i) => (
              <div key={i} className="small" style={{ padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                <b>{c.authorName}</b> on <Link to={`/projects/${c.projectId}`}>{c.projectName}</Link>: {c.body}
              </div>
            ))}
          </div>
        </div>
      )}

      {creating && <NewProject onClose={() => setCreating(false)} />}
    </div>
  );
}
