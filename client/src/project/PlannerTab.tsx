import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api } from "../api";
import { useMoney, useToast } from "../state";
import type { Task } from "../types";
import type { TabProps } from "./context";

const STATUS: Task["status"][] = ["todo", "doing", "done", "blocked"];
const day = 86400_000;

export default function PlannerTab({ bundle }: TabProps) {
  const money = useMoney();
  const toast = useToast();
  const pid = bundle.project.id;
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [start, setStart] = useState(new Date(Date.now() + 7 * day).toISOString().slice(0, 10));
  const [draft, setDraft] = useState({ title: "", phase: "Build", startDate: "", endDate: "", estimatedCost: 0 });

  useEffect(() => { api.get<{ tasks: Task[] }>(`/projects/${pid}/tasks`).then((r) => setTasks(r.tasks)).catch(toast.error); }, [pid, toast]);

  const generate = async (replace: boolean) => {
    if (replace && tasks?.length && !confirm("Replace your current plan with a generated one?")) return;
    try { setTasks((await api.post<{ tasks: Task[] }>(`/projects/${pid}/tasks/generate`, { startDate: start, replace })).tasks); } catch (err) { toast.error(err); }
  };
  const patch = async (id: string, body: Partial<Task>) => {
    try { setTasks((await api.patch<{ tasks: Task[] }>(`/tasks/${id}`, body)).tasks); } catch (err) { toast.error(err); }
  };
  const remove = async (id: string) => setTasks((await api.del<{ tasks: Task[] }>(`/tasks/${id}`)).tasks);
  const add = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setTasks((await api.post<{ tasks: Task[] }>(`/projects/${pid}/tasks`, { ...draft, startDate: draft.startDate || null, endDate: draft.endDate || null, estimatedCost: money.toZar(draft.estimatedCost) })).tasks);
      setDraft({ title: "", phase: "Build", startDate: "", endDate: "", estimatedCost: 0 });
    } catch (err) { toast.error(err); }
  };

  const range = useMemo(() => {
    const dated = (tasks ?? []).filter((t) => t.startDate && t.endDate);
    if (!dated.length) return null;
    const min = Math.min(...dated.map((t) => Date.parse(t.startDate!)));
    const max = Math.max(...dated.map((t) => Date.parse(t.endDate!)));
    return { min, max, span: Math.max(day, max - min + day) };
  }, [tasks]);

  const est = (tasks ?? []).reduce((s, t) => s + t.estimatedCost, 0);
  const act = (tasks ?? []).reduce((s, t) => s + t.actualCost, 0);
  const done = (tasks ?? []).filter((t) => t.status === "done").length;

  if (tasks === null) return <p className="muted">Loading plan…</p>;

  return (
    <div className="stack">
      <div className="grid cols-4">
        <div className="card stat"><span className="tiny">Progress</span><b>{tasks.length ? Math.round((done / tasks.length) * 100) : 0}%</b><div className="meter"><span style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }} /></div></div>
        <div className="card stat"><span className="tiny">Planned spend</span><b>{money.format(est)}</b></div>
        <div className="card stat"><span className="tiny">Actual spend</span><b style={{ color: act > est && est > 0 ? "var(--bad)" : undefined }}>{money.format(act)}</b><span className="tiny">{est > 0 ? `${act > est ? "over" : "under"} by ${money.format(Math.abs(est - act))}` : ""}</span></div>
        <div className="card stat"><span className="tiny">Schedule</span><b>{range ? `${Math.round(range.span / day)} days` : "—"}</b><span className="tiny">{range ? `${new Date(range.min).toLocaleDateString()} → ${new Date(range.max).toLocaleDateString()}` : "no dates yet"}</span></div>
      </div>

      <div className="card row">
        <label className="field">Start date<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <button className="btn accent" style={{ alignSelf: "end" }} onClick={() => generate(tasks.length > 0)}>✦ {tasks.length ? "Regenerate" : "Generate"} {bundle.project.roomType.toLowerCase()} plan</button>
        <span className="tiny" style={{ alignSelf: "end" }}>Phases, working-day durations and budget split are based on your room type and budget.</span>
      </div>

      {range && (
        <div className="card">
          <h3>Timeline</h3>
          <div className="gantt">
            {tasks.filter((t) => t.startDate && t.endDate).map((t) => {
              const left = ((Date.parse(t.startDate!) - range.min) / range.span) * 100;
              const width = Math.max(1.5, ((Date.parse(t.endDate!) - Date.parse(t.startDate!) + day) / range.span) * 100);
              return (
                <div key={t.id} className="gantt-row">
                  <span className="small" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                  <div className="gantt-track"><div className={`gantt-bar ${t.status}`} style={{ left: `${left}%`, width: `${width}%` }} title={`${t.startDate} → ${t.endDate}`} /></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h3>Tasks & budget tracker</h3>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Task</th><th>Phase</th><th>Dates</th><th>Status</th><th className="num">Planned</th><th className="num">Actual ({money.code})</th><th /></tr></thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.title}<div className="tiny"><input placeholder="Assignee" defaultValue={t.assignee ?? ""} onBlur={(e) => e.target.value !== (t.assignee ?? "") && patch(t.id, { assignee: e.target.value || null })} style={{ padding: "3px 6px", fontSize: 12, marginTop: 4 }} /></div></td>
                <td className="small">{t.phase}</td>
                <td className="small" style={{ minWidth: 150 }}>
                  <input type="date" value={t.startDate ?? ""} onChange={(e) => patch(t.id, { startDate: e.target.value || null })} style={{ padding: "3px 6px", fontSize: 12 }} />
                  <input type="date" value={t.endDate ?? ""} onChange={(e) => patch(t.id, { endDate: e.target.value || null })} style={{ padding: "3px 6px", fontSize: 12, marginTop: 4 }} />
                </td>
                <td><select value={t.status} onChange={(e) => patch(t.id, { status: e.target.value as Task["status"] })} style={{ padding: "4px 6px" }}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select></td>
                <td className="num">{money.format(t.estimatedCost)}</td>
                <td className="num" style={{ width: 120 }}><input type="number" min={0} defaultValue={money.fromZar(t.actualCost) || ""} onBlur={(e) => patch(t.id, { actualCost: money.toZar(Number(e.target.value) || 0) })} style={{ textAlign: "right", padding: "4px 6px" }} /></td>
                <td><button className="btn ghost sm" onClick={() => remove(t.id)} aria-label="Delete task">✕</button></td>
              </tr>
            ))}
            {tasks.length === 0 && <tr><td colSpan={7} className="muted">No tasks yet — generate a plan or add your own below.</td></tr>}
          </tbody>
        </table></div>
        <form className="row" onSubmit={add} style={{ marginTop: 12 }}>
          <input required placeholder="New task" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} style={{ flex: 2, minWidth: 160 }} />
          <select value={draft.phase} onChange={(e) => setDraft({ ...draft, phase: e.target.value })} style={{ width: 130 }}>{["Design", "Procurement", "Build", "Finish", "Handover"].map((p) => <option key={p}>{p}</option>)}</select>
          <input type="date" value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} style={{ width: 150 }} />
          <input type="date" value={draft.endDate} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} style={{ width: 150 }} />
          <input type="number" min={0} placeholder={`Cost (${money.code})`} value={draft.estimatedCost || ""} onChange={(e) => setDraft({ ...draft, estimatedCost: Number(e.target.value) })} style={{ width: 130 }} />
          <button className="btn primary">Add</button>
        </form>
      </div>
    </div>
  );
}
