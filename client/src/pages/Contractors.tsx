import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { fmtDate, Modal, Stars } from "../components/ui";
import { useAuth, useCatalog, useToast } from "../state";
import type { Contractor, Project } from "../types";

interface RequestRow { id: string; contractor: Contractor; projectName: string | null; message: string; status: string; createdAt: string }

export default function Contractors() {
  const catalog = useCatalog();
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [province, setProvince] = useState(user?.province ?? "");
  const [trade, setTrade] = useState(params.get("trade") ?? "");
  const [list, setList] = useState<Contractor[]>([]);
  const [trades, setTrades] = useState<string[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [contact, setContact] = useState<Contractor | null>(null);
  const [form, setForm] = useState({ projectId: params.get("project") ?? "", message: "" });

  useEffect(() => {
    api.get<{ contractors: Contractor[]; trades: string[] }>(`/contractors?province=${encodeURIComponent(province)}&trade=${encodeURIComponent(trade)}`)
      .then((r) => { setList(r.contractors); setTrades(r.trades); }).catch(toast.error);
  }, [province, trade, toast]);
  useEffect(() => {
    api.get<{ projects: Project[] }>("/projects").then((r) => setProjects(r.projects)).catch(() => {});
    api.get<{ requests: RequestRow[] }>("/contractor-requests").then((r) => setRequests(r.requests)).catch(() => {});
  }, []);

  const open = (c: Contractor) => {
    const p = projects.find((x) => x.id === form.projectId);
    setForm({ ...form, message: form.message || `Hi ${c.name},\n\nI'm planning a ${p ? `${p.roomType.toLowerCase()} renovation (${p.room.length} × ${p.room.width} m)` : "renovation"} in ${user?.province}. Could you provide a quote and your earliest availability? My VISTORA project brief and designs are available on request.\n\nThanks,\n${user?.name}` });
    setContact(c);
  };
  const send = async () => {
    if (!contact) return;
    try {
      await api.post(`/contractors/${contact.id}/requests`, { projectId: form.projectId || null, message: form.message });
      toast.info(`Quote request sent to ${contact.name}`);
      setContact(null);
      setForm({ ...form, message: "" });
      setRequests((await api.get<{ requests: RequestRow[] }>("/contractor-requests")).requests);
    } catch (err) { toast.error(err); }
  };

  return (
    <div className="container">
      <div className="page-head">
        <div><h1>Find contractors</h1><p className="muted">Verified local trades. Send your VISTORA project for a quote in one click.</p></div>
        <div className="row">
          <select value={province} onChange={(e) => setProvince(e.target.value)} style={{ width: 180 }}><option value="">All provinces</option>{catalog.provinces.map((p) => <option key={p.name}>{p.name}</option>)}</select>
          <select value={trade} onChange={(e) => setTrade(e.target.value)} style={{ width: 200 }}><option value="">All trades</option>{trades.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
      </div>
      <div className="grid cols-3">
        {list.map((c) => (
          <div key={c.id} className="card stack" style={{ gap: 8 }}>
            <div className="row between"><h3 style={{ margin: 0 }}>{c.name}</h3>{c.verified && <span className="chip good">✓ Verified</span>}</div>
            <Stars value={c.rating} /><span className="tiny">{c.reviews} reviews · {c.yearsActive} years · {"R".repeat(c.priceLevel)} · replies in ~{c.responseHours}h</span>
            <p className="small muted" style={{ margin: 0 }}>{c.bio}</p>
            <div className="row" style={{ gap: 4 }}>{c.trades.map((t) => <span key={t} className="chip">{t}</span>)}</div>
            <div className="tiny">Serves: {c.provinces.join(", ")}</div>
            <button className="btn primary" onClick={() => open(c)}>Request a quote</button>
          </div>
        ))}
        {list.length === 0 && <div className="empty" style={{ gridColumn: "1 / -1" }}>No contractors match — try another province or trade.</div>}
      </div>
      {requests.length > 0 && (
        <div className="card section" style={{ margin: "24px 0 40px" }}>
          <h3>Your quote requests</h3>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Contractor</th><th>Project</th><th>Sent</th><th>Status</th></tr></thead>
            <tbody>{requests.map((r) => <tr key={r.id}><td>{r.contractor?.name}</td><td>{r.projectName ?? "—"}</td><td>{fmtDate(r.createdAt)}</td><td><span className="chip">{r.status}</span></td></tr>)}</tbody>
          </table></div>
        </div>
      )}
      {contact && (
        <Modal title={`Request a quote — ${contact.name}`} onClose={() => setContact(null)}>
          <div className="stack">
            <label className="field">Project
              <select value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}><option value="">No specific project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            </label>
            <label className="field">Message<textarea rows={8} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></label>
            <button className="btn primary" onClick={send} disabled={form.message.trim().length < 10}>Send request</button>
            <p className="tiny" style={{ margin: 0 }}>Always check registration, insurance and references, and get at least three quotes.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}
