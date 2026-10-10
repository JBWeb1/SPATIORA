import { Router } from "express";
import { z } from "zod";
import { all, get, newId, run, tx } from "../db.js";
import { currentUser, requireAuth } from "../lib/auth.js";
import { notFound } from "../lib/http.js";
import { ownedProject, touch } from "../lib/projects.js";

export const plannerRouter = Router();
plannerRouter.use(requireAuth);

const PHASE_TEMPLATES: Record<string, [string, string, number, number][]> = {
  // [title, phase, durationDays, shareOfBudget]
  default: [
    ["Finalise design & finishes", "Design", 5, 0],
    ["Obtain 3 contractor quotes", "Procurement", 7, 0],
    ["Order long-lead items", "Procurement", 3, 0.25],
    ["Strip-out & preparation", "Build", 3, 0.05],
    ["Electrical first fix", "Build", 2, 0.08],
    ["Plaster, ceilings & repairs", "Build", 4, 0.08],
    ["Flooring installation", "Build", 3, 0.18],
    ["Painting", "Finish", 3, 0.07],
    ["Electrical second fix & lighting", "Finish", 2, 0.06],
    ["Furniture delivery & styling", "Finish", 2, 0.2],
    ["Snag list & sign-off (CoC)", "Handover", 1, 0.03],
  ],
  Kitchen: [
    ["Finalise kitchen layout & appliance specs", "Design", 5, 0],
    ["Obtain 3 contractor quotes", "Procurement", 7, 0],
    ["Order cabinetry & appliances", "Procurement", 2, 0.35],
    ["Strip-out old kitchen", "Build", 2, 0.04],
    ["Plumbing & gas first fix", "Build", 2, 0.06],
    ["Electrical first fix", "Build", 2, 0.06],
    ["Install cabinetry", "Build", 4, 0.12],
    ["Template & fit countertops", "Build", 7, 0.15],
    ["Splashback tiling", "Finish", 2, 0.05],
    ["Plumbing, gas & electrical second fix", "Finish", 2, 0.05],
    ["Painting & touch-ups", "Finish", 2, 0.04],
    ["Gas & electrical certificates, sign-off", "Handover", 1, 0.03],
  ],
  Bathroom: [
    ["Finalise bathroom layout & fittings", "Design", 4, 0],
    ["Obtain 3 contractor quotes", "Procurement", 7, 0],
    ["Order sanitaryware & tiles", "Procurement", 2, 0.3],
    ["Strip-out", "Build", 2, 0.05],
    ["Plumbing first fix", "Build", 2, 0.1],
    ["Waterproofing (SANS 10400) & screed", "Build", 3, 0.08],
    ["Wall & floor tiling", "Build", 5, 0.2],
    ["Install vanity, WC, shower & bath", "Finish", 2, 0.12],
    ["Electrical: extractor, lighting, heated towel rail", "Finish", 1, 0.06],
    ["Silicone, paint & accessories", "Finish", 1, 0.04],
    ["Plumbing CoC & sign-off", "Handover", 1, 0.03],
  ],
};

function serializeTask(t: Record<string, unknown>) {
  return {
    id: t.id, title: t.title, phase: t.phase, startDate: t.start_date, endDate: t.end_date, status: t.status,
    estimatedCost: t.estimated_cost, actualCost: t.actual_cost, assignee: t.assignee, sort: t.sort,
  };
}

const list = (projectId: string) => all("SELECT * FROM tasks WHERE project_id = ? ORDER BY sort, start_date", projectId).map(serializeTask);

plannerRouter.get("/projects/:id/tasks", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  res.json({ tasks: list(p.id) });
});

const taskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  phase: z.string().max(40).default("Build"),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  status: z.enum(["todo", "doing", "done", "blocked"]).default("todo"),
  estimatedCost: z.number().min(0).default(0),
  actualCost: z.number().min(0).default(0),
  assignee: z.string().max(120).nullable().optional(),
});

plannerRouter.post("/projects/:id/tasks", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const b = taskSchema.parse(req.body);
  const sort = (get<{ m: number | null }>("SELECT MAX(sort) AS m FROM tasks WHERE project_id = ?", p.id)?.m ?? 0) + 1;
  run(`INSERT INTO tasks (id, project_id, title, phase, start_date, end_date, status, estimated_cost, actual_cost, assignee, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    newId(), p.id, b.title, b.phase, b.startDate ?? null, b.endDate ?? null, b.status, b.estimatedCost, b.actualCost, b.assignee ?? null, sort);
  touch(p.id);
  res.status(201).json({ tasks: list(p.id) });
});

plannerRouter.post("/projects/:id/tasks/generate", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const { startDate, replace } = z.object({ startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), replace: z.boolean().default(false) }).parse(req.body ?? {});
  const template = PHASE_TEMPLATES[p.room_type] ?? PHASE_TEMPLATES.default;
  const budget = p.budget || 0;
  let cursor = new Date(startDate ?? new Date().toISOString().slice(0, 10));
  const addWorkdays = (d: Date, n: number) => {
    const out = new Date(d);
    let left = n;
    while (left > 0) {
      out.setDate(out.getDate() + 1);
      if (out.getDay() !== 0 && out.getDay() !== 6) left--;
    }
    return out;
  };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  tx(() => {
    if (replace) run("DELETE FROM tasks WHERE project_id = ?", p.id);
    const base = get<{ m: number | null }>("SELECT MAX(sort) AS m FROM tasks WHERE project_id = ?", p.id)?.m ?? 0;
    template.forEach(([title, phase, days, share], i) => {
      const start = cursor;
      const end = addWorkdays(start, Math.max(days - 1, 0));
      run(`INSERT INTO tasks (id, project_id, title, phase, start_date, end_date, status, estimated_cost, sort) VALUES (?, ?, ?, ?, ?, ?, 'todo', ?, ?)`,
        newId(), p.id, title, phase, iso(start), iso(end), Math.round(budget * share), base + i + 1);
      cursor = addWorkdays(end, 1);
    });
  });
  touch(p.id);
  res.status(201).json({ tasks: list(p.id) });
});

function ownedTask(req: Parameters<typeof ownedProject>[0], id: string) {
  const t = get<{ id: string; project_id: string }>("SELECT t.id, t.project_id FROM tasks t JOIN projects p ON p.id = t.project_id WHERE t.id = ? AND p.user_id = ?", id, currentUser(req).id);
  if (!t) throw notFound("Task");
  return t;
}

plannerRouter.patch("/tasks/:id", (req, res) => {
  const t = ownedTask(req, String(req.params.id));
  const b = taskSchema.partial().parse(req.body);
  const cols: Record<string, unknown> = {
    title: b.title, phase: b.phase, start_date: b.startDate, end_date: b.endDate, status: b.status,
    estimated_cost: b.estimatedCost, actual_cost: b.actualCost, assignee: b.assignee,
  };
  for (const [col, val] of Object.entries(cols)) {
    if (val !== undefined) run(`UPDATE tasks SET ${col} = ? WHERE id = ?`, val as string | number | null, t.id);
  }
  touch(t.project_id);
  res.json({ tasks: list(t.project_id) });
});

plannerRouter.delete("/tasks/:id", (req, res) => {
  const t = ownedTask(req, String(req.params.id));
  run("DELETE FROM tasks WHERE id = ?", t.id);
  res.json({ tasks: list(t.project_id) });
});
