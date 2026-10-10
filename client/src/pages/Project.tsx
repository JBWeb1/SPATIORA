import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { useCatalog, useMoney, useToast } from "../state";
import type { Project } from "../types";
import type { ProjectBundle } from "../project/context";
import { STATUS_LABEL } from "./Dashboard";
import RedesignTab from "../project/RedesignTab";
import MaterialsTab from "../project/MaterialsTab";
import EstimateTab from "../project/EstimateTab";
import ShoppingTab from "../project/ShoppingTab";
import PlannerTab from "../project/PlannerTab";
import EnergyTab from "../project/EnergyTab";
import AssistantTab from "../project/AssistantTab";
import ShareTab from "../project/ShareTab";

// three.js is only downloaded when the 3D Studio is opened.
const StudioTab = lazy(() => import("../project/StudioTab"));

const TABS = [
  ["redesign", "✦ AI Redesign"],
  ["studio", "▣ 3D Studio"],
  ["materials", "◧ Materials"],
  ["assistant", "✎ Assistant"],
  ["estimate", "R Estimate"],
  ["shopping", "🛒 Shopping list"],
  ["planner", "◷ Planner"],
  ["energy", "⚡ Energy"],
  ["share", "◎ Share & brief"],
] as const;

export default function ProjectPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "redesign";
  const catalog = useCatalog();
  const money = useMoney();
  const toast = useToast();
  const nav = useNavigate();
  const [bundle, setBundleState] = useState<ProjectBundle | null>(null);
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    try {
      setBundleState(await api.get<ProjectBundle>(`/projects/${id}`));
    } catch (err) {
      toast.error(err);
      nav("/app");
    }
  }, [id, nav, toast]);

  useEffect(() => { reload(); }, [reload]);

  // Live updates: pick up new comments, concepts and edits made elsewhere (shared link
  // visitors, another device or tab) without a manual refresh.
  const [live, setLive] = useState(false);
  const known = useRef<{ updatedAt: string; comments: number; designs: number } | null>(null);
  useEffect(() => {
    if (bundle) known.current = { updatedAt: bundle.project.updatedAt, comments: bundle.comments.length, designs: bundle.designs.length };
  }, [bundle]);
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible" || !known.current) return;
      try {
        const pulse = await api.get<{ updatedAt: string; comments: number; designs: number; latestComment: { authorName: string; body: string; isOwner: number } | null }>(`/projects/${id}/pulse`);
        if (stopped) return;
        setLive(true);
        const k = known.current;
        if (pulse.comments > k.comments && pulse.latestComment && !pulse.latestComment.isOwner) {
          toast.info(`💬 ${pulse.latestComment.authorName}: ${pulse.latestComment.body.slice(0, 80)}`);
        }
        if (pulse.comments !== k.comments || pulse.designs !== k.designs || pulse.updatedAt !== k.updatedAt) {
          known.current = { updatedAt: pulse.updatedAt, comments: pulse.comments, designs: pulse.designs };
          const fresh = await api.get<ProjectBundle>(`/projects/${id}`);
          if (!stopped) setBundleState(fresh);
        }
      } catch { setLive(false); }
    };
    const t = setInterval(tick, 15_000);
    document.addEventListener("visibilitychange", tick);
    return () => { stopped = true; clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [id, toast]);

  const setBundle = useCallback((fn: (b: ProjectBundle) => ProjectBundle) => setBundleState((b) => (b ? fn(b) : b)), []);
  const save = useCallback(async (patch: Partial<Project>) => {
    try {
      const r = await api.patch<{ project: Project }>(`/projects/${id}`, patch);
      setBundleState((b) => (b ? { ...b, project: r.project } : b));
    } catch (err) { toast.error(err); throw err; }
  }, [id, toast]);

  if (!bundle) return <div className="container section muted">Loading project…</div>;
  const p = bundle.project;
  const goTo = (t: string) => setParams({ tab: t });
  const props = { bundle, setBundle, save, reload, goTo };

  const duplicate = async () => {
    try {
      const r = await api.post<{ project: Project }>(`/projects/${id}/duplicate`);
      toast.info("Project duplicated");
      nav(`/projects/${r.project.id}`);
    } catch (err) { toast.error(err); }
  };
  const remove = async () => {
    if (!confirm(`Delete "${p.name}" and all its designs? This cannot be undone.`)) return;
    await api.del(`/projects/${id}`);
    nav("/app");
  };

  return (
    <div className="container">
      <div className="page-head">
        <div className="grow">
          <Link to="/app" className="small muted no-print">← Projects</Link>
          {editing ? (
            <div className="row" style={{ marginTop: 6 }}>
              <input defaultValue={p.name} autoFocus style={{ maxWidth: 360 }} onKeyDown={(e) => { if (e.key === "Enter") { save({ name: (e.target as HTMLInputElement).value }); setEditing(false); } }} onBlur={(e) => { save({ name: e.target.value }); setEditing(false); }} />
            </div>
          ) : (
            <h1 onDoubleClick={() => setEditing(true)} title="Double-click to rename">{p.name}</h1>
          )}
          <div className="row small muted">
            <select value={p.roomType} onChange={(e) => save({ roomType: e.target.value })} style={{ width: "auto" }}>{catalog.roomTypes.map((r) => <option key={r}>{r}</option>)}</select>
            <select value={p.status} onChange={(e) => save({ status: e.target.value as Project["status"] })} style={{ width: "auto" }}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span>{p.room.length} × {p.room.width} m · {(p.room.length * p.room.width).toFixed(1)} m²</span>
            {live && <span title="This page updates itself when collaborators comment or the project changes elsewhere"><span className="live-dot" />Live</span>}
            <span>Budget: <input type="number" min={0} step={1000} defaultValue={money.fromZar(p.budget) || ""} placeholder="not set" style={{ width: 120 }} onBlur={(e) => save({ budget: money.toZar(Number(e.target.value) || 0) })} /> {money.code}</span>
          </div>
        </div>
        <div className="row no-print">
          <Link className="btn sm accent" to={`/projects/${id}/present`}>▶ Present</Link>
          <button className="btn sm" onClick={() => setEditing(true)}>Rename</button>
          <button className="btn sm" onClick={duplicate}>Duplicate</button>
          <button className="btn sm danger" onClick={remove}>Delete</button>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => goTo(k)}>{label}</button>)}
      </div>

      <div style={{ paddingBottom: 48 }}>
        {tab === "redesign" && <RedesignTab {...props} />}
        {tab === "studio" && <Suspense fallback={<p className="muted">Loading 3D Studio…</p>}><StudioTab {...props} /></Suspense>}
        {tab === "materials" && <MaterialsTab {...props} />}
        {tab === "assistant" && <AssistantTab {...props} />}
        {tab === "estimate" && <EstimateTab {...props} />}
        {tab === "shopping" && <ShoppingTab {...props} />}
        {tab === "planner" && <PlannerTab {...props} />}
        {tab === "energy" && <EnergyTab {...props} />}
        {tab === "share" && <ShareTab {...props} />}
      </div>
    </div>
  );
}
