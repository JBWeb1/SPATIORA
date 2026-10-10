import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { BeforeAfter, fmtDate, Logo } from "../components/ui";
import { useCatalog, useMoney, useToast } from "../state";
import type { Comment, Design, MoodItem, Product, Project } from "../types";

interface SharedData {
  project: Omit<Project, "shareToken" | "clientId">;
  owner: { name: string; company: string | null };
  designs: Design[];
  comments: Comment[];
  shopping: { product: Product; quantity: number }[];
}

const REACTIONS = [["love", "😍"], ["like", "👍"], ["unsure", "🤔"], ["dislike", "👎"]] as const;

export default function Shared() {
  const { token = "" } = useParams();
  const catalog = useCatalog();
  const money = useMoney("ZAR");
  const toast = useToast();
  const [data, setData] = useState<SharedData | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState(() => { try { return localStorage.getItem("vistora.guestName") ?? ""; } catch { return ""; } });
  const [drafts, setDrafts] = useState<Record<string, { body: string; reaction: string | null }>>({});

  const load = useCallback(() => api.get<SharedData>(`/share/${token}`).then(setData).catch((e) => setError(e.message)), [token]);
  useEffect(() => { load(); }, [load]);

  const submit = async (designId: string | null) => {
    const d = drafts[designId ?? "general"] ?? { body: "", reaction: null };
    if (!name.trim()) return toast.error(new Error("Please add your name first"));
    if (!d.body.trim() && !d.reaction) return;
    try {
      await api.post(`/share/${token}/comments`, { authorName: name.trim(), body: d.body.trim() || REACTIONS.find((r) => r[0] === d.reaction)?.[1] || "👍", designId, reaction: d.reaction });
      try { localStorage.setItem("vistora.guestName", name.trim()); } catch { /* ignore */ }
      setDrafts({ ...drafts, [designId ?? "general"]: { body: "", reaction: null } });
      toast.info("Thanks for your feedback!");
      load();
    } catch (err) { toast.error(err); }
  };

  if (error) return <div className="container section"><div className="empty"><h3>This link isn't available</h3><p>{error}. The owner may have stopped sharing it.</p><Link to="/" className="btn">Visit VISTORA</Link></div></div>;
  if (!data) return <div className="container section muted">Loading…</div>;
  const p = data.project;
  const styleName = (id: string) => catalog.styles.find((s) => s.id === id)?.name ?? id;

  const Feedback = ({ designId }: { designId: string | null }) => {
    const key = designId ?? "general";
    const d = drafts[key] ?? { body: "", reaction: null };
    const comments = data.comments.filter((c) => c.designId === designId);
    return (
      <div className="stack" style={{ gap: 6 }}>
        {comments.map((c) => <div key={c.id} className="small"><b>{c.reaction ? `${REACTIONS.find((r) => r[0] === c.reaction)?.[1]} ` : ""}{c.authorName}</b> <span className="tiny">{fmtDate(c.createdAt)}</span><div>{c.body}</div></div>)}
        <div className="row" style={{ gap: 4 }}>
          {REACTIONS.map(([k, e]) => <button key={k} className={`chip ${d.reaction === k ? "on" : ""}`} onClick={() => setDrafts({ ...drafts, [key]: { ...d, reaction: d.reaction === k ? null : k } })}>{e}</button>)}
          <input className="grow" placeholder="Leave a comment…" value={d.body} onChange={(e) => setDrafts({ ...drafts, [key]: { ...d, body: e.target.value } })} style={{ minWidth: 140 }} />
          <button className="btn sm primary" onClick={() => submit(designId)}>Send</button>
        </div>
      </div>
    );
  };

  return (
    <>
      <header className="topbar"><div className="container"><Link to="/" className="brand"><Logo size={28} /> VISTORA</Link><span className="muted small" style={{ marginLeft: "auto" }}>Shared by {data.owner.name}{data.owner.company ? ` · ${data.owner.company}` : ""}</span></div></header>
      <div className="container" style={{ paddingBottom: 60 }}>
        <div className="page-head"><div><h1>{p.name}</h1><p className="muted">{p.roomType} · {p.room.length} × {p.room.width} m{p.description ? ` · ${p.description}` : ""}</p></div></div>
        <div className="card row" style={{ marginBottom: 16 }}>
          <label className="field grow" style={{ maxWidth: 320 }}>Your name (for comments)<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Aunt Zanele" /></label>
          <span className="small muted">Vote with an emoji or leave a comment on each concept.</span>
        </div>
        <div className="grid cols-2">
          {data.designs.map((d) => (
            <div key={d.id} className="card stack">
              {d.sourceImage ? <BeforeAfter before={d.sourceImage} after={d.resultImage} /> : <img src={d.resultImage} alt={styleName(d.style)} style={{ borderRadius: 12 }} />}
              <div className="row between"><h3 style={{ margin: 0 }}>{styleName(d.style)}{d.favorite ? " ♥" : ""}</h3></div>
              {d.notes && <p className="small muted" style={{ margin: 0 }}>{d.notes}</p>}
              <Feedback designId={d.id} />
            </div>
          ))}
          {data.designs.length === 0 && <div className="empty">No concepts have been generated yet.</div>}
        </div>
        {p.moodboard.length > 0 && (
          <div className="card section" style={{ marginTop: 20 }}>
            <h3>Mood board</h3>
            <div className="moodboard">{(p.moodboard as MoodItem[]).map((m) => (
              <div key={m.id} className="mood">
                {m.kind === "image" ? <img src={m.value} alt={m.label ?? ""} /> : m.kind === "note" ? <div style={{ padding: 14, background: "var(--accent-soft)" }}>{m.value}</div> : <div style={{ height: 90, background: m.value }} />}
                {m.label && <div className="tiny" style={{ padding: "6px 8px" }}>{m.label}</div>}
              </div>
            ))}</div>
          </div>
        )}
        {data.shopping.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <h3>Shopping list</h3>
            <table className="table"><tbody>{data.shopping.map((s) => <tr key={s.product.id}><td>{s.product.name}<div className="tiny">{s.product.retailer}</div></td><td className="num">× {s.quantity}</td><td className="num">{money.format(s.product.price * s.quantity)}</td></tr>)}</tbody></table>
          </div>
        )}
        <div className="card" style={{ marginTop: 20 }}><h3>General feedback</h3><Feedback designId={null} /></div>
        <p className="tiny" style={{ marginTop: 20 }}>Made with VISTORA — <Link to="/register">redesign your own room free</Link>.</p>
      </div>
    </>
  );
}
