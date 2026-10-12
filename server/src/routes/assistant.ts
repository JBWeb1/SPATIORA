import { Router } from "express";
import { z } from "zod";
import { all, newId, run } from "../db.js";
import { currentUser, rateLimit, requireAuth } from "../lib/auth.js";
import { readUpload } from "../lib/images.js";
import { ownedProject, projectContext, serializeProject } from "../lib/projects.js";
import { analyzeRoom, chat, designBrief, type ChatTurn } from "../services/assistant.js";
import { estimateProject } from "../lib/estimateProject.js";

export const assistantRouter = Router();
assistantRouter.use(requireAuth);

assistantRouter.get("/projects/:id/assistant", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  res.json({ messages: all("SELECT id, role, content, created_at AS createdAt FROM assistant_messages WHERE project_id = ? ORDER BY created_at, rowid", p.id) });
});

assistantRouter.post("/projects/:id/assistant", rateLimit(30, 60_000), async (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const { message } = z.object({ message: z.string().trim().min(1).max(4000) }).parse(req.body);
  const history = all<ChatTurn>("SELECT role, content FROM assistant_messages WHERE project_id = ? ORDER BY created_at, rowid", p.id);
  const ctx = projectContext(p, currentUser(req).province);
  const { reply, provider } = await chat(ctx, history, message, readUpload(p.source_image));
  run("INSERT INTO assistant_messages (id, project_id, role, content) VALUES (?, ?, 'user', ?)", newId(), p.id, message);
  run("INSERT INTO assistant_messages (id, project_id, role, content) VALUES (?, ?, 'assistant', ?)", newId(), p.id, reply);
  res.json({ reply, provider });
});

assistantRouter.delete("/projects/:id/assistant", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  run("DELETE FROM assistant_messages WHERE project_id = ?", p.id);
  res.status(204).end();
});

assistantRouter.post("/projects/:id/analyze", rateLimit(10, 60_000), async (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const result = await analyzeRoom(projectContext(p, currentUser(req).province), readUpload(p.source_image));
  res.json(result);
});

assistantRouter.post("/projects/:id/brief", rateLimit(10, 60_000), async (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const user = currentUser(req);
  const sp = serializeProject(p);
  const est = estimateProject(sp, { quality: "standard", province: user.province, includeDemolition: false, electricalPoints: 0, plumbingPoints: 0, contingency: 0.1 });
  const designs = all<{ style: string; prompt: string }>("SELECT style, prompt FROM designs WHERE project_id = ? ORDER BY favorite DESC, created_at DESC LIMIT 5", p.id);
  const tasks = all<{ title: string }>("SELECT title FROM tasks WHERE project_id = ? ORDER BY sort", p.id).map((t) => t.title);
  res.json(await designBrief(projectContext(p, user.province), { designs, estimateTotal: est.totals.total || undefined, tasks }));
});
