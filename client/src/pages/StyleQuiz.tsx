import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useAuth, useCatalog, useToast } from "../state";
import type { User } from "../types";

interface Option { label: string; detail: string; colors: string[]; styles: string[] }
const QUESTIONS: { q: string; options: Option[] }[] = [
  { q: "Pick the palette that feels like home", options: [
    { label: "Soft neutrals", detail: "Whites, oatmeal, pale wood", colors: ["#fafaf8", "#e8e6e1", "#cfccc4", "#b48a5a"], styles: ["minimalist", "scandinavian", "japandi"] },
    { label: "Earthy & warm", detail: "Terracotta, ochre, kiaat", colors: ["#8c4a2f", "#c98a4b", "#e7d3b0", "#2a1d15"], styles: ["afro-modern", "mid-century", "farmhouse"] },
    { label: "Moody & rich", detail: "Charcoal, navy, brass", colors: ["#1c1a17", "#2c3e57", "#b08d57", "#d9cbb5"], styles: ["modern-luxury", "industrial", "contemporary"] },
    { label: "Fresh & breezy", detail: "Sea blues, sand, white", colors: ["#1d3b53", "#5b8fa8", "#a9cfd8", "#efe8da"], styles: ["coastal", "scandinavian", "contemporary"] },
  ] },
  { q: "Your ideal Sunday spot", options: [
    { label: "A plush velvet sofa", detail: "Under a statement chandelier", colors: ["#3b3530", "#b08d57"], styles: ["modern-luxury", "contemporary"] },
    { label: "A low daybed", detail: "Linen, morning light, a ceramic mug", colors: ["#ddd3c3", "#6e6355"], styles: ["japandi", "minimalist"] },
    { label: "A leather armchair", detail: "Exposed brick, record player", colors: ["#7a5a43", "#1f1f1f"], styles: ["industrial", "mid-century"] },
    { label: "A big farmhouse table", detail: "Friends, food and open shelving", colors: ["#c9b79c", "#6b7d5c"], styles: ["farmhouse", "afro-modern", "coastal"] },
  ] },
  { q: "Choose a floor", options: [
    { label: "Wide oak planks", detail: "Natural and warm", colors: ["#b48a5a"], styles: ["scandinavian", "japandi", "farmhouse"] },
    { label: "Polished concrete", detail: "Raw and seamless", colors: ["#a9a6a0"], styles: ["industrial", "minimalist"] },
    { label: "Large marble-look tiles", detail: "Glossy and grand", colors: ["#e7e3dd"], styles: ["modern-luxury", "contemporary"] },
    { label: "Terracotta or patterned tiles", detail: "Handmade character", colors: ["#b8653f"], styles: ["afro-modern", "mid-century", "coastal"] },
  ] },
  { q: "How much stuff do you like on display?", options: [
    { label: "Almost nothing", detail: "Everything hidden away", colors: [], styles: ["minimalist", "japandi"] },
    { label: "A few curated pieces", detail: "Art, a plant, a sculpture", colors: [], styles: ["contemporary", "scandinavian", "modern-luxury"] },
    { label: "Collected over time", detail: "Books, baskets, finds", colors: [], styles: ["afro-modern", "farmhouse", "mid-century"] },
    { label: "Functional and visible", detail: "Tools, shelves, hooks", colors: [], styles: ["industrial", "farmhouse"] },
  ] },
  { q: "Pick a light", options: [
    { label: "Brass chandelier", detail: "", colors: [], styles: ["modern-luxury"] },
    { label: "Paper lantern", detail: "", colors: [], styles: ["japandi", "scandinavian"] },
    { label: "Edison cage pendants", detail: "", colors: [], styles: ["industrial", "farmhouse"] },
    { label: "Sputnik / globe", detail: "", colors: [], styles: ["mid-century", "contemporary", "coastal"] },
  ] },
  { q: "Which word fits best?", options: [
    { label: "Calm", detail: "", colors: [], styles: ["japandi", "minimalist", "coastal"] },
    { label: "Glamorous", detail: "", colors: [], styles: ["modern-luxury", "contemporary"] },
    { label: "Soulful", detail: "", colors: [], styles: ["afro-modern", "mid-century", "farmhouse"] },
    { label: "Edgy", detail: "", colors: [], styles: ["industrial", "contemporary"] },
  ] },
];

export default function StyleQuiz() {
  const catalog = useCatalog();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);

  const pick = async (i: number) => {
    const next = [...answers.slice(0, step), i];
    setAnswers(next);
    if (step < QUESTIONS.length - 1) { setStep(step + 1); return; }
    // Score
    const scores: Record<string, number> = {};
    const colors: string[] = [];
    next.forEach((a, qi) => {
      const opt = QUESTIONS[qi].options[a];
      opt.styles.forEach((s, rank) => { scores[s] = (scores[s] ?? 0) + (3 - rank); });
      colors.push(...opt.colors);
    });
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const primary = ranked[0][0];
    const palette = [...new Set([...colors, ...(catalog.styles.find((s) => s.id === primary)?.palette ?? [])])].slice(0, 6);
    try {
      const r = await api.patch<{ user: User }>("/auth/me", { styleProfile: { primary, secondary: ranked[1]?.[0], scores, palette } });
      setUser(r.user);
      setSaved(true);
      setStep(QUESTIONS.length);
    } catch (err) { toast.error(err); }
  };

  const profile = user?.styleProfile;
  const showResult = step >= QUESTIONS.length || (!!profile && answers.length === 0 && step === 0 && !params.get("retake"));
  if (showResult && profile) {
    const primary = catalog.styles.find((s) => s.id === profile.primary)!;
    const secondary = catalog.styles.find((s) => s.id === profile.secondary);
    const total = Object.values(profile.scores).reduce((a, b) => a + b, 0) || 1;
    return (
      <div className="container section" style={{ maxWidth: 820 }}>
        {params.get("welcome") && <span className="chip accent">Welcome to VISTORA 🎉</span>}
        <h1 style={{ marginTop: 10 }}>Your Style DNA: {primary.name}</h1>
        <p className="muted" style={{ fontSize: 17 }}>{primary.tagline}{secondary && <> With a touch of <b>{secondary.name}</b>.</>}</p>
        <div className="card stack">
          <div className="row" style={{ gap: 0, borderRadius: 12, overflow: "hidden", height: 70 }}>{(profile.palette ?? primary.palette).map((c) => <span key={c} style={{ flex: 1, height: "100%", background: c }} />)}</div>
          <div className="grid cols-2">
            <div><h3>Signature elements</h3><ul className="small">{primary.keywords.map((k) => <li key={k}>{k}</li>)}</ul></div>
            <div><h3>Materials to love</h3><ul className="small">{primary.materials.map((k) => <li key={k}>{k}</li>)}</ul></div>
          </div>
          <h3>Your style mix</h3>
          {Object.entries(profile.scores).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, v]) => (
            <div key={id} className="row small"><span style={{ width: 160 }}>{catalog.styles.find((s) => s.id === id)?.name}</span><div className="meter grow"><span style={{ width: `${(v / total) * 100}%` }} /></div><span className="tiny" style={{ width: 40 }}>{Math.round((v / total) * 100)}%</span></div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 16 }}>
          <Link to="/app" className="btn primary">{saved ? "Start designing →" : "Back to projects"}</Link>
          <Link to={`/marketplace`} className="btn">Shop {primary.name}</Link>
          <button className="btn ghost" onClick={() => { setStep(0); setAnswers([]); setSaved(false); window.history.replaceState(null, "", "/style-quiz?retake=1"); }}>Retake quiz</button>
        </div>
      </div>
    );
  }

  const q = QUESTIONS[Math.min(step, QUESTIONS.length - 1)];
  return (
    <div className="container section" style={{ maxWidth: 900 }}>
      {params.get("welcome") && <span className="chip accent">Welcome! Let's find your style first — or <Link to="/app">skip</Link></span>}
      <div className="row between" style={{ marginTop: 10 }}>
        <h1>{q.q}</h1>
        <span className="muted small">{step + 1} / {QUESTIONS.length}</span>
      </div>
      <div className="meter" style={{ marginBottom: 20 }}><span style={{ width: `${(step / QUESTIONS.length) * 100}%` }} /></div>
      <div className="grid cols-2">
        {q.options.map((o, i) => (
          <button key={o.label} className={`quiz-option ${answers[step] === i ? "on" : ""}`} onClick={() => pick(i)}>
            <div className="bar">{(o.colors.length ? o.colors : catalog.styles.find((s) => s.id === o.styles[0])?.palette ?? []).map((c, j) => <span key={j} style={{ background: c }} />)}</div>
            <div className="p"><b>{o.label}</b>{o.detail && <div className="small muted">{o.detail}</div>}</div>
          </button>
        ))}
      </div>
      {step > 0 && <button className="btn ghost" style={{ marginTop: 16 }} onClick={() => setStep(step - 1)}>← Back</button>}
    </div>
  );
}
