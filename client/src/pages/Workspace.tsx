import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { fmtDate, Logo, Modal } from "../components/ui";
import { useAuth, useCatalog, useMoney, useToast } from "../state";
import type { Client, Project, Quote, QuoteItem, User } from "../types";

function QuoteEditor({ quote, clients, projects, onClose, onSaved }: { quote: Quote; clients: Client[]; projects: Project[]; onClose: () => void; onSaved: (q: Quote) => void }) {
  const { user } = useAuth();
  const money = useMoney("ZAR");
  const toast = useToast();
  const [q, setQ] = useState(quote);
  const [preview, setPreview] = useState(false);
  const subtotal = q.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const markup = subtotal * q.markup;
  const vat = (subtotal + markup) * q.vatRate;
  const setItem = (i: number, patch: Partial<QuoteItem>) => setQ({ ...q, items: q.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const save = async () => {
    try {
      const r = await api.patch<{ quote: Quote }>(`/quotes/${q.id}`, { title: q.title, clientId: q.clientId, projectId: q.projectId, items: q.items, vatRate: q.vatRate, markup: q.markup, status: q.status, notes: q.notes, validUntil: q.validUntil });
      onSaved(r.quote);
      toast.info("Quote saved");
    } catch (err) { toast.error(err); }
  };
  const client = clients.find((c) => c.id === q.clientId);

  if (preview) return (
    <Modal title={`Quotation ${q.number}`} onClose={() => setPreview(false)} wide>
      <div className="stack" id="quote-print">
        <div className="row between"><div className="row"><Logo size={34} /><div><b>{user?.company ?? user?.name}</b><div className="tiny">{user?.email}</div></div></div><div className="right"><h2 style={{ margin: 0 }}>QUOTATION</h2><div className="small">{q.number} · {fmtDate(q.createdAt)}</div>{q.validUntil && <div className="tiny">Valid until {q.validUntil}</div>}</div></div>
        <div className="small"><b>Prepared for:</b> {client ? `${client.name}${client.address ? `, ${client.address}` : ""}${client.email ? ` · ${client.email}` : ""}` : "—"}<br /><b>Project:</b> {q.title}</div>
        <table className="table">
          <thead><tr><th>Description</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th></tr></thead>
          <tbody>{q.items.map((i, k) => <tr key={k}><td>{i.description}<div className="tiny">{i.category}</div></td><td className="num">{i.quantity} {i.unit}</td><td className="num">{money.format(i.unitPrice * (1 + q.markup))}</td><td className="num">{money.format(i.quantity * i.unitPrice * (1 + q.markup))}</td></tr>)}</tbody>
          <tfoot>
            <tr><td colSpan={3}>Subtotal</td><td className="num">{money.format(subtotal + markup)}</td></tr>
            <tr><td colSpan={3}>VAT ({Math.round(q.vatRate * 100)}%)</td><td className="num">{money.format(vat)}</td></tr>
            <tr><td colSpan={3}>Total</td><td className="num">{money.format(subtotal + markup + vat)}</td></tr>
          </tfoot>
        </table>
        {q.notes && <div className="small" style={{ whiteSpace: "pre-wrap" }}><b>Terms & notes</b><br />{q.notes}</div>}
        <button className="btn no-print" onClick={() => window.print()}>Print / save as PDF</button>
      </div>
    </Modal>
  );

  return (
    <Modal title={`Edit ${q.number}`} onClose={onClose} wide>
      <div className="stack">
        <input value={q.title} onChange={(e) => setQ({ ...q, title: e.target.value })} />
        <div className="form-grid">
          <label className="field">Client<select value={q.clientId ?? ""} onChange={(e) => setQ({ ...q, clientId: e.target.value || null })}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="field">Project<select value={q.projectId ?? ""} onChange={(e) => setQ({ ...q, projectId: e.target.value || null })}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label className="field">Status<select value={q.status} onChange={(e) => setQ({ ...q, status: e.target.value as Quote["status"] })}>{["draft", "sent", "accepted", "declined"].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="field">Valid until<input type="date" value={q.validUntil ?? ""} onChange={(e) => setQ({ ...q, validUntil: e.target.value || null })} /></label>
          <label className="field">Markup %<input type="number" min={0} max={100} value={Math.round(q.markup * 100)} onChange={(e) => setQ({ ...q, markup: Number(e.target.value) / 100 })} /></label>
          <label className="field">VAT %<input type="number" min={0} max={50} value={Math.round(q.vatRate * 100)} onChange={(e) => setQ({ ...q, vatRate: Number(e.target.value) / 100 })} /></label>
        </div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Description</th><th>Category</th><th className="num">Qty</th><th>Unit</th><th className="num">Cost (R, excl. VAT)</th><th className="num">Line</th><th /></tr></thead>
          <tbody>{q.items.map((it, i) => (
            <tr key={i}>
              <td><input value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} style={{ minWidth: 200, padding: "4px 6px" }} /></td>
              <td><input value={it.category} onChange={(e) => setItem(i, { category: e.target.value })} style={{ width: 120, padding: "4px 6px" }} /></td>
              <td><input type="number" min={0} step={0.1} value={it.quantity} onChange={(e) => setItem(i, { quantity: Number(e.target.value) })} style={{ width: 80, padding: "4px 6px" }} /></td>
              <td><input value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} style={{ width: 60, padding: "4px 6px" }} /></td>
              <td><input type="number" min={0} value={it.unitPrice} onChange={(e) => setItem(i, { unitPrice: Number(e.target.value) })} style={{ width: 110, padding: "4px 6px", textAlign: "right" }} /></td>
              <td className="num">{money.format(it.quantity * it.unitPrice)}</td>
              <td><button className="btn ghost sm" onClick={() => setQ({ ...q, items: q.items.filter((_, j) => j !== i) })} aria-label="Remove line">✕</button></td>
            </tr>
          ))}</tbody>
        </table></div>
        <button className="btn sm" style={{ alignSelf: "start" }} onClick={() => setQ({ ...q, items: [...q.items, { description: "New item", category: "General", quantity: 1, unit: "ea", unitPrice: 0 }] })}>+ Line item</button>
        <textarea placeholder="Terms, payment schedule, exclusions…" value={q.notes ?? ""} onChange={(e) => setQ({ ...q, notes: e.target.value })} />
        <div className="row between">
          <div className="small">Cost {money.format(subtotal)} + markup {money.format(markup)} + VAT {money.format(vat)} = <b>{money.format(subtotal + markup + vat)}</b> · margin {money.format(markup)}</div>
          <div className="row"><button className="btn" onClick={() => setPreview(true)}>Preview</button><button className="btn primary" onClick={save}>Save</button></div>
        </div>
      </div>
    </Modal>
  );
}

export default function Workspace() {
  const { user, setUser, refresh } = useAuth();
  const catalog = useCatalog();
  const money = useMoney("ZAR");
  const toast = useToast();
  const [tab, setTab] = useState<"clients" | "quotes">("quotes");
  const [clients, setClients] = useState<Client[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [editingClient, setEditingClient] = useState<Partial<Client> | null>(null);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [fromProject, setFromProject] = useState("");
  const pro = !!user?.planDetails.workspace;

  useEffect(() => {
    if (!pro) return;
    api.get<{ clients: Client[] }>("/clients").then((r) => setClients(r.clients)).catch(toast.error);
    api.get<{ quotes: Quote[] }>("/quotes").then((r) => setQuotes(r.quotes)).catch(toast.error);
    api.get<{ projects: Project[] }>("/projects").then((r) => setProjects(r.projects)).catch(() => {});
  }, [pro, toast]);

  if (!pro) return (
    <div className="container section" style={{ maxWidth: 760 }}>
      <h1>Professional Workspace</h1>
      <p className="muted" style={{ fontSize: 17 }}>For interior designers, architects, contractors and developers: manage clients, turn VISTORA estimates into branded quotations with markup and VAT, and present concepts through shareable client pages.</p>
      <div className="card stack">
        <ul className="small"><li>Client CRM linked to projects</li><li>One-click quotations from any project's estimate and shopping list</li><li>Markup, VAT and margin tracking; printable/PDF quotes</li><li>Quote pipeline: draft → sent → accepted</li><li>{catalog.plans.pro.monthlyGenerations} AI redesigns per month and unlimited projects</li></ul>
        <button className="btn accent lg" onClick={async () => { try { setUser((await api.post<{ user: User }>("/auth/me/plan", { plan: "pro" })).user); refresh(); } catch (err) { toast.error(err); } }}>Upgrade to Professional — R{catalog.plans.pro.priceZar}/month</button>
      </div>
    </div>
  );

  const saveClient = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingClient) return;
    try {
      const body = { name: editingClient.name, email: editingClient.email ?? "", phone: editingClient.phone ?? null, address: editingClient.address ?? null, notes: editingClient.notes ?? null };
      if (editingClient.id) await api.patch(`/clients/${editingClient.id}`, body); else await api.post("/clients", body);
      setClients((await api.get<{ clients: Client[] }>("/clients")).clients);
      setEditingClient(null);
    } catch (err) { toast.error(err); }
  };
  const deleteClient = async (c: Client) => {
    if (!confirm(`Delete ${c.name}? Their projects and quotes are kept.`)) return;
    await api.del(`/clients/${c.id}`);
    setClients(clients.filter((x) => x.id !== c.id));
  };
  const newQuote = async () => {
    try {
      const r = fromProject
        ? await api.post<{ quote: Quote }>(`/quotes/from-project/${fromProject}`)
        : await api.post<{ quote: Quote }>("/quotes", { title: "New quotation", items: [] });
      setQuotes([r.quote, ...quotes]);
      setEditingQuote(r.quote);
    } catch (err) { toast.error(err); }
  };
  const deleteQuote = async (q: Quote) => {
    if (!confirm(`Delete ${q.number}?`)) return;
    await api.del(`/quotes/${q.id}`);
    setQuotes(quotes.filter((x) => x.id !== q.id));
  };
  const pipeline = (s: Quote["status"]) => quotes.filter((q) => q.status === s).reduce((t, q) => t + q.totals.total, 0);

  return (
    <div className="container" style={{ paddingBottom: 48 }}>
      <div className="page-head"><div><h1>Professional Workspace</h1><p className="muted">{user?.company ?? user?.name} · clients, quotations and presentations</p></div></div>
      <div className="grid cols-4" style={{ marginBottom: 16 }}>
        <div className="card stat"><span className="tiny">Clients</span><b>{clients.length}</b></div>
        <div className="card stat"><span className="tiny">Draft pipeline</span><b>{money.format(pipeline("draft"))}</b></div>
        <div className="card stat"><span className="tiny">Sent, awaiting reply</span><b>{money.format(pipeline("sent"))}</b></div>
        <div className="card stat"><span className="tiny">Accepted</span><b>{money.format(pipeline("accepted"))}</b></div>
      </div>
      <div className="tabs">
        <button className={tab === "quotes" ? "on" : ""} onClick={() => setTab("quotes")}>Quotations</button>
        <button className={tab === "clients" ? "on" : ""} onClick={() => setTab("clients")}>Clients</button>
      </div>

      {tab === "quotes" && (
        <div className="card">
          <div className="row" style={{ marginBottom: 12 }}>
            <select value={fromProject} onChange={(e) => setFromProject(e.target.value)} style={{ maxWidth: 300 }}><option value="">Blank quotation</option>{projects.map((p) => <option key={p.id} value={p.id}>From project: {p.name}</option>)}</select>
            <button className="btn primary" onClick={newQuote}>+ New quotation</button>
          </div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Number</th><th>Title</th><th>Client</th><th>Status</th><th className="num">Total</th><th /></tr></thead>
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td className="mono">{q.number}</td>
                  <td>{q.title}{q.projectId && <div className="tiny"><Link to={`/projects/${q.projectId}`}>{q.projectName}</Link></div>}</td>
                  <td>{q.clientName ?? "—"}</td>
                  <td><span className={`chip ${q.status === "accepted" ? "good" : q.status === "declined" ? "bad" : q.status === "sent" ? "warn" : ""}`}>{q.status}</span></td>
                  <td className="num">{money.format(q.totals.total)}</td>
                  <td className="right"><button className="btn sm" onClick={() => setEditingQuote(q)}>Open</button> <button className="btn ghost sm" onClick={() => deleteQuote(q)} aria-label="Delete">✕</button></td>
                </tr>
              ))}
              {quotes.length === 0 && <tr><td colSpan={6} className="muted">No quotations yet. Create one from a project to pull in its estimate and shopping list.</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {tab === "clients" && (
        <div className="card">
          <button className="btn primary" style={{ marginBottom: 12 }} onClick={() => setEditingClient({ name: "" })}>+ Add client</button>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Name</th><th>Contact</th><th className="num">Projects</th><th className="num">Quotes</th><th /></tr></thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b><div className="tiny">{c.address}</div></td>
                  <td className="small">{c.email}<div>{c.phone}</div></td>
                  <td className="num">{c.projectCount}</td><td className="num">{c.quoteCount}</td>
                  <td className="right"><button className="btn sm" onClick={() => setEditingClient(c)}>Edit</button> <button className="btn ghost sm" onClick={() => deleteClient(c)} aria-label="Delete">✕</button></td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan={5} className="muted">No clients yet.</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}

      {editingClient && (
        <Modal title={editingClient.id ? "Edit client" : "New client"} onClose={() => setEditingClient(null)}>
          <form className="stack" onSubmit={saveClient}>
            <label className="field">Name<input required value={editingClient.name ?? ""} onChange={(e) => setEditingClient({ ...editingClient, name: e.target.value })} /></label>
            <div className="form-grid">
              <label className="field">Email<input type="email" value={editingClient.email ?? ""} onChange={(e) => setEditingClient({ ...editingClient, email: e.target.value })} /></label>
              <label className="field">Phone<input value={editingClient.phone ?? ""} onChange={(e) => setEditingClient({ ...editingClient, phone: e.target.value })} /></label>
            </div>
            <label className="field">Address<input value={editingClient.address ?? ""} onChange={(e) => setEditingClient({ ...editingClient, address: e.target.value })} /></label>
            <label className="field">Notes<textarea value={editingClient.notes ?? ""} onChange={(e) => setEditingClient({ ...editingClient, notes: e.target.value })} /></label>
            <button className="btn primary">Save client</button>
          </form>
        </Modal>
      )}
      {editingQuote && <QuoteEditor quote={editingQuote} clients={clients} projects={projects} onClose={() => setEditingQuote(null)} onSaved={(nq) => { setQuotes(quotes.map((x) => (x.id === nq.id ? nq : x))); setEditingQuote(nq); }} />}
    </div>
  );
}
