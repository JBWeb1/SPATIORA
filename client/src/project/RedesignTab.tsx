import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { BeforeAfter, fmtDate, Spinner } from "../components/ui";
import { useAuth, useCatalog, useToast } from "../state";
import type { Design, Project } from "../types";
import type { TabProps } from "./context";

interface Analysis {
  roomType: string;
  estimatedDimensions: { length: number; width: number; height: number };
  features: string[];
  issues: string[];
  suggestedStyles: string[];
  quickWins: string[];
  summary: string;
}

const LIGHTING = ["", "Bright natural daylight", "Warm, cosy evening lighting", "Layered ambient + accent lighting", "Dramatic statement pendant", "Soft, diffuse Japanese-style light"];

export default function RedesignTab({ bundle, setBundle, save, reload }: TabProps) {
  const catalog = useCatalog();
  const { user, refresh } = useAuth();
  const toast = useToast();
  const p = bundle.project;
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [needUpgrade, setNeedUpgrade] = useState("");
  const [styleId, setStyleId] = useState<string>((p.finishes.style as string) ?? user?.styleProfile?.primary ?? catalog.styles[0].id);
  const style = catalog.styles.find((s) => s.id === styleId) ?? catalog.styles[0];
  const [prefs, setPrefs] = useState({
    colors: [] as string[], materials: [] as string[], furniture: "", lighting: "", budget: p.budget || 0,
    preserveLayout: true, intensity: 0.6, extraPrompt: "", variants: 2,
  });
  const [selectedId, setSelectedId] = useState<string | null>(bundle.designs[0]?.id ?? null);
  const [compare, setCompare] = useState<string[]>([]);
  const selected = bundle.designs.find((d) => d.id === selectedId) ?? bundle.designs[0];

  const upload = async (file: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast.error(new Error("Please upload a JPG, PNG or WebP photo"));
    const fd = new FormData();
    fd.append("photo", file);
    setUploading(true);
    try {
      const r = await api.post<{ project: Project }>(`/projects/${p.id}/photo`, fd);
      setBundle((b) => ({ ...b, project: r.project }));
      setAnalysis(null);
      toast.info("Photo uploaded — now pick a style and generate");
    } catch (err) { toast.error(err); } finally { setUploading(false); }
  };

  const analyse = async () => {
    setAnalysing(true);
    try {
      const r = await api.post<{ analysis: Analysis; provider: string }>(`/projects/${p.id}/analyze`);
      setAnalysis(r.analysis);
      if (r.analysis.suggestedStyles[0]) setStyleId(r.analysis.suggestedStyles[0]);
    } catch (err) { toast.error(err); } finally { setAnalysing(false); }
  };

  const applyDims = async () => {
    if (!analysis) return;
    await save({ room: { ...p.room, ...analysis.estimatedDimensions } });
    toast.info("Room dimensions updated from photo analysis");
  };

  const generate = async () => {
    setBusy(true);
    setNeedUpgrade("");
    try {
      const { variants, ...preferences } = prefs;
      const r = await api.post<{ designs: Design[] }>(`/projects/${p.id}/designs`, {
        styleId, variants, preferences: { ...preferences, budget: preferences.budget || undefined, furniture: preferences.furniture || undefined, lighting: preferences.lighting || undefined, extraPrompt: preferences.extraPrompt || undefined },
      });
      setBundle((b) => ({ ...b, designs: [...r.designs, ...b.designs] }));
      setSelectedId(r.designs[0].id);
      refresh();
      reload();
    } catch (err) {
      if (err instanceof ApiError && err.code === "upgrade_required") setNeedUpgrade(err.message);
      else toast.error(err);
    } finally { setBusy(false); }
  };

  const updateDesign = async (d: Design, patch: Partial<Pick<Design, "favorite" | "notes">>) => {
    try {
      const r = await api.patch<{ design: Design }>(`/designs/${d.id}`, patch);
      setBundle((b) => ({ ...b, designs: b.designs.map((x) => (x.id === d.id ? r.design : x)) }));
    } catch (err) { toast.error(err); }
  };
  const removeDesign = async (d: Design) => {
    if (!confirm("Delete this concept?")) return;
    await api.del(`/designs/${d.id}`);
    setBundle((b) => ({ ...b, designs: b.designs.filter((x) => x.id !== d.id) }));
    setSelectedId(null);
  };
  const setCover = async (d: Design) => {
    await api.post(`/projects/${p.id}/cover`, { designId: d.id });
    toast.info("Set as project cover");
  };

  const compared = useMemo(() => compare.map((id) => bundle.designs.find((d) => d.id === id)).filter(Boolean) as Design[], [compare, bundle.designs]);
  const styleName = (id: string) => catalog.styles.find((s) => s.id === id)?.name ?? id;
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="split">
      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0 }}>1 · Your room</h3>
          <div
            className={`dropzone ${drag ? "drag" : ""}`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) upload(f); }}
            role="button"
            tabIndex={0}
          >
            {p.sourceImage ? <img src={p.sourceImage} alt="Your room" style={{ borderRadius: 8, maxHeight: 180, margin: "0 auto" }} /> : <div style={{ fontSize: 30 }}>📷</div>}
            <div className="small" style={{ marginTop: 8 }}>{uploading ? "Uploading…" : p.sourceImage ? "Click or drop to replace photo" : "Drop a room photo here, or click to browse"}</div>
            <div className="tiny">No photo? Generate from a blank room, or build the room in the 3D Studio.</div>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="btn sm" onClick={analyse} disabled={analysing}>{analysing ? "Analysing…" : "✦ Analyse my room"}</button>
          {analysis && (
            <div className="small stack" style={{ gap: 6 }}>
              <p style={{ margin: 0 }}>{analysis.summary}</p>
              {analysis.issues.length > 0 && <div><b>To fix:</b> {analysis.issues.join("; ")}</div>}
              <div><b>Quick wins:</b><ul style={{ margin: "4px 0", paddingLeft: 18 }}>{analysis.quickWins.map((q) => <li key={q}>{q}</li>)}</ul></div>
              <div className="row" style={{ gap: 6 }}>{analysis.suggestedStyles.map((s) => <button key={s} className={`chip ${styleId === s ? "on" : ""}`} onClick={() => setStyleId(s)}>{styleName(s)}</button>)}</div>
              <button className="btn sm ghost" onClick={applyDims}>Use estimated size: {analysis.estimatedDimensions.length} × {analysis.estimatedDimensions.width} m</button>
            </div>
          )}
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0 }}>2 · Choose a design</h3>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {catalog.styles.map((s) => (
              <button key={s.id} className={`style-card ${s.id === styleId ? "on" : ""}`} onClick={() => setStyleId(s.id)}>
                <div className="bar">{s.palette.map((c) => <span key={c} style={{ background: c }} />)}</div>
                <span className="small"><b>{s.name}</b>{user?.styleProfile?.primary === s.id && " ★"}</span>
              </button>
            ))}
          </div>
          <p className="tiny" style={{ margin: 0 }}>{style.tagline}</p>

          <div>
            <div className="small" style={{ fontWeight: 500, marginBottom: 6 }}>Colours (optional)</div>
            <div className="row" style={{ gap: 6 }}>
              {prefs.colors.map((c, i) => (
                <input key={i} type="color" value={c} onChange={(e) => setPrefs({ ...prefs, colors: prefs.colors.map((x, j) => (j === i ? e.target.value : x)) })} />
              ))}
              {prefs.colors.length < 4 && <button className="btn sm" onClick={() => setPrefs({ ...prefs, colors: [...prefs.colors, style.palette[prefs.colors.length + 1] ?? "#888888"] })}>+ colour</button>}
              {prefs.colors.length > 0 && <button className="btn sm ghost" onClick={() => setPrefs({ ...prefs, colors: [] })}>clear</button>}
              {user?.styleProfile?.palette && prefs.colors.length === 0 && <button className="btn sm ghost" onClick={() => setPrefs({ ...prefs, colors: user.styleProfile!.palette!.slice(0, 4) })}>Use my Style DNA palette</button>}
            </div>
          </div>
          <div>
            <div className="small" style={{ fontWeight: 500, marginBottom: 6 }}>Materials</div>
            <div className="row" style={{ gap: 6 }}>
              {style.materials.map((m) => <button key={m} className={`chip ${prefs.materials.includes(m) ? "on" : ""}`} onClick={() => setPrefs({ ...prefs, materials: toggle(prefs.materials, m) })}>{m}</button>)}
            </div>
          </div>
          <label className="field">Furniture wishes<input placeholder="e.g. L-shaped sofa, round dining table" value={prefs.furniture} onChange={(e) => setPrefs({ ...prefs, furniture: e.target.value })} /></label>
          <label className="field">Lighting
            <select value={prefs.lighting} onChange={(e) => setPrefs({ ...prefs, lighting: e.target.value })}>{LIGHTING.map((l) => <option key={l} value={l}>{l || "Let VISTORA decide"}</option>)}</select>
          </label>
          <label className="field">Anything else?<textarea rows={2} placeholder="e.g. child-friendly fabrics, space for a reading nook" value={prefs.extraPrompt} onChange={(e) => setPrefs({ ...prefs, extraPrompt: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={prefs.preserveLayout} onChange={(e) => setPrefs({ ...prefs, preserveLayout: e.target.checked })} /> Preserve my room's layout</label>
          <label className="field">Transformation strength: {Math.round(prefs.intensity * 100)}%
            <input type="range" min={0.2} max={1} step={0.05} value={prefs.intensity} onChange={(e) => setPrefs({ ...prefs, intensity: Number(e.target.value) })} />
          </label>
          <div className="row">
            <label className="field" style={{ width: 120 }}>Variations
              <select value={prefs.variants} onChange={(e) => setPrefs({ ...prefs, variants: Number(e.target.value) })}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select>
            </label>
            <button className="btn accent grow" style={{ alignSelf: "end" }} onClick={generate} disabled={busy}>{busy ? "Designing…" : "3 · Redesign my room ✦"}</button>
          </div>
          {needUpgrade && <div className="chip warn" style={{ whiteSpace: "normal" }}>{needUpgrade} <Link to="/account">Upgrade</Link></div>}
          {catalog.capabilities.imageProvider === "studio-preview" && <p className="tiny" style={{ margin: 0 }}>Running in Studio Preview mode (style-graded concept boards). Connect an AI image provider on the server for photorealistic renders.</p>}
        </div>
      </div>

      <div className="stack">
        {busy && <div className="card"><Spinner label={`Generating ${prefs.variants} ${style.name} concept${prefs.variants > 1 ? "s" : ""}…`} /></div>}
        {compared.length === 2 ? (
          <div className="card stack">
            <div className="row between"><h3 style={{ margin: 0 }}>Compare concepts</h3><button className="btn sm" onClick={() => setCompare([])}>Exit compare</button></div>
            <BeforeAfter before={compared[0].resultImage} after={compared[1].resultImage} beforeLabel={styleName(compared[0].style)} afterLabel={styleName(compared[1].style)} />
          </div>
        ) : selected ? (
          <div className="card stack">
            {selected.sourceImage ? <BeforeAfter before={selected.sourceImage} after={selected.resultImage} /> : <img src={selected.resultImage} alt="Design concept" style={{ borderRadius: 12 }} />}
            <div className="row between">
              <div>
                <h3 style={{ margin: 0 }}>{styleName(selected.style)} concept</h3>
                <span className="tiny">{fmtDate(selected.createdAt, true)} · {selected.provider === "studio-preview" ? "Studio Preview" : "AI render"}</span>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <button className="btn sm" onClick={() => updateDesign(selected, { favorite: !selected.favorite })}>{selected.favorite ? "♥ Favourite" : "♡ Favourite"}</button>
                <button className="btn sm" onClick={() => setCover(selected)}>Set as cover</button>
                <a className="btn sm" href={selected.resultImage} download={`vistora-${selected.style}.${selected.resultImage.split(".").pop()}`}>Download</a>
                <button className="btn sm danger" onClick={() => removeDesign(selected)}>Delete</button>
              </div>
            </div>
            <textarea placeholder="Notes about this concept…" defaultValue={selected.notes ?? ""} key={selected.id} onBlur={(e) => e.target.value !== (selected.notes ?? "") && updateDesign(selected, { notes: e.target.value || null })} rows={2} />
            <details><summary className="small muted">AI prompt used</summary><p className="small muted">{selected.prompt}</p></details>
          </div>
        ) : (
          <div className="empty">
            <h3>No concepts yet</h3>
            <p>Upload a photo (optional), pick a style and press <b>Redesign my room</b>.</p>
          </div>
        )}

        {bundle.designs.length > 0 && (
          <div className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>All concepts ({bundle.designs.length})</h3><span className="tiny">Tick two to compare side-by-side</span></div>
            <div className="grid cols-4" style={{ marginTop: 10, gap: 10 }}>
              {bundle.designs.map((d) => (
                <div key={d.id} className="stack" style={{ gap: 4 }}>
                  <button className="thumb" onClick={() => { setSelectedId(d.id); setCompare([]); }} style={{ border: d.id === selected?.id ? "2px solid var(--accent)" : "0", padding: 0, cursor: "pointer" }}>
                    <img src={d.resultImage} alt={styleName(d.style)} loading="lazy" />
                    {d.favorite && <span className="chip badge-corner">♥</span>}
                  </button>
                  <label className="check tiny"><input type="checkbox" checked={compare.includes(d.id)} onChange={() => setCompare((c) => (c.includes(d.id) ? c.filter((x) => x !== d.id) : [...c, d.id].slice(-2)))} />{styleName(d.style)}</label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
