import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { fmtDate, Markdown, uid } from "../components/ui";
import { useCatalog, useToast } from "../state";
import type { MoodItem } from "../types";
import type { TabProps } from "./context";

const REACTION: Record<string, string> = { love: "😍", like: "👍", unsure: "🤔", dislike: "👎" };

export default function ShareTab({ bundle, setBundle, save, reload }: TabProps) {
  const catalog = useCatalog();
  const toast = useToast();
  const p = bundle.project;
  const [comment, setComment] = useState("");
  const [brief, setBrief] = useState<string | null>(null);
  const [briefBusy, setBriefBusy] = useState(false);
  const [note, setNote] = useState("");
  const [color, setColor] = useState("#b08d57");
  const link = p.shareToken ? `${window.location.origin}/s/${p.shareToken}` : "";

  const toggleShare = async (enabled: boolean) => {
    try {
      const r = await api.post<{ shareToken: string | null }>(`/projects/${p.id}/share`, { enabled });
      setBundle((b) => ({ ...b, project: { ...b.project, shareToken: r.shareToken } }));
    } catch (err) { toast.error(err); }
  };
  const copy = async (text: string, what: string) => {
    try { await navigator.clipboard.writeText(text); toast.info(`${what} copied`); } catch { toast.error(new Error("Copy failed — select and copy manually")); }
  };
  const postComment = async () => {
    if (!comment.trim()) return;
    try { await api.post(`/projects/${p.id}/comments`, { body: comment }); setComment(""); reload(); } catch (err) { toast.error(err); }
  };
  const deleteComment = async (id: string) => { await api.del(`/comments/${id}`); reload(); };
  const makeBrief = async () => {
    setBriefBusy(true);
    try { setBrief((await api.post<{ brief: string }>(`/projects/${p.id}/brief`)).brief); } catch (err) { toast.error(err); } finally { setBriefBusy(false); }
  };

  const mood = p.moodboard;
  const setMood = (items: MoodItem[]) => save({ moodboard: items }).catch(() => {});
  const addMood = (item: Omit<MoodItem, "id">) => setMood([...mood, { ...item, id: uid() }]);
  const favDesigns = bundle.designs.filter((d) => d.favorite);

  return (
    <div className="grid cols-2" style={{ alignItems: "start" }}>
      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Share with family, clients or contractors</h3>
          <label className="check"><input type="checkbox" checked={!!p.shareToken} onChange={(e) => toggleShare(e.target.checked)} /> Anyone with the link can view and comment</label>
          {link && (
            <div className="row">
              <input readOnly value={link} className="grow" onFocus={(e) => e.target.select()} />
              <button className="btn sm" onClick={() => copy(link, "Link")}>Copy</button>
              <a className="btn sm" href={`https://wa.me/?text=${encodeURIComponent(`Have a look at my ${p.roomType.toLowerCase()} design on VISTORA: ${link}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
            </div>
          )}
          <p className="tiny" style={{ margin: 0 }}>Viewers see your concepts, mood board and shopping list, and can vote on each concept. They can't edit anything.</p>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0 }}>Comments & votes ({bundle.comments.length})</h3>
          {bundle.comments.length === 0 && <p className="muted small">No comments yet.</p>}
          {bundle.comments.map((c) => (
            <div key={c.id} className="small" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 8 }}>
              <div className="row between"><b>{c.reaction ? `${REACTION[c.reaction]} ` : ""}{c.authorName}{c.isOwner ? " (you)" : ""}</b><span className="tiny">{fmtDate(c.createdAt, true)} <button className="btn ghost sm" onClick={() => deleteComment(c.id)} aria-label="Delete comment">✕</button></span></div>
              {c.designId && <span className="tiny">on a {catalog.styles.find((s) => s.id === bundle.designs.find((d) => d.id === c.designId)?.style)?.name ?? ""} concept</span>}
              <div>{c.body}</div>
            </div>
          ))}
          <div className="row"><input className="grow" placeholder="Add a note or reply…" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => e.key === "Enter" && postComment()} /><button className="btn sm primary" onClick={postComment}>Post</button></div>
        </div>

        <div className="card stack">
          <div className="row between">
            <h3 style={{ margin: 0 }}>Contractor-ready project brief</h3>
            <button className="btn accent sm" onClick={makeBrief} disabled={briefBusy}>{briefBusy ? "Writing…" : brief ? "Regenerate" : "✦ Generate brief"}</button>
          </div>
          {brief ? (
            <>
              <div className="card flat tight" style={{ maxHeight: 420, overflowY: "auto" }}><Markdown text={brief} /></div>
              <div className="row">
                <button className="btn sm" onClick={() => copy(brief, "Brief")}>Copy</button>
                <a className="btn sm" href={URL.createObjectURL(new Blob([brief], { type: "text/markdown" }))} download={`${p.name}-brief.md`}>Download .md</a>
                <Link className="btn sm" to={`/contractors?project=${p.id}`}>Send to contractors →</Link>
              </div>
            </>
          ) : <p className="small muted" style={{ margin: 0 }}>Summarises scope, finishes, budget, timeline and questions to ask — ready to send for quotes.</p>}
        </div>
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Mood board</h3>
        <div className="row">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Pick colour" />
          <button className="btn sm" onClick={() => addMood({ kind: "color", value: color, label: color })}>+ Colour</button>
          <select onChange={(e) => { const m = catalog.materials.find((x) => x.id === e.target.value); if (m) addMood({ kind: "material", value: m.color, label: m.name }); e.target.value = ""; }} defaultValue="" style={{ width: 170 }}>
            <option value="" disabled>+ Material…</option>
            {catalog.materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {favDesigns.length > 0 && <button className="btn sm" onClick={() => favDesigns.forEach((d) => addMood({ kind: "image", value: d.resultImage, label: catalog.styles.find((s) => s.id === d.style)?.name }))}>+ Favourite concepts</button>}
        </div>
        <div className="row"><input className="grow" placeholder="Add a note, idea or inspiration…" value={note} onChange={(e) => setNote(e.target.value)} /><button className="btn sm" onClick={() => { if (note.trim()) { addMood({ kind: "note", value: note.trim() }); setNote(""); } }}>+ Note</button></div>
        {bundle.shopping.length > 0 && (
          <select onChange={(e) => { const s = bundle.shopping.find((x) => x.product.id === e.target.value); if (s) addMood({ kind: "product", value: s.product.color, label: s.product.name }); e.target.value = ""; }} defaultValue="">
            <option value="" disabled>+ Product from shopping list…</option>
            {bundle.shopping.map((s) => <option key={s.id} value={s.product.id}>{s.product.name}</option>)}
          </select>
        )}
        {mood.length === 0 ? <div className="empty small">Collect colours, materials, products, notes and favourite concepts in one board.</div> : (
          <div className="moodboard">
            {mood.map((m) => (
              <div key={m.id} className="mood">
                {m.kind === "image" ? <img src={m.value} alt={m.label ?? ""} /> : m.kind === "note" ? <div style={{ padding: 14, fontSize: 14, background: "var(--accent-soft)" }}>{m.value}</div> : <div style={{ height: m.kind === "color" ? 80 : 110, background: m.value }} />}
                {m.label && <div className="tiny" style={{ padding: "6px 8px" }}>{m.kind === "material" ? "◧ " : m.kind === "product" ? "🛒 " : ""}{m.label}</div>}
                <button className="btn sm x" onClick={() => setMood(mood.filter((x) => x.id !== m.id))} aria-label="Remove">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
