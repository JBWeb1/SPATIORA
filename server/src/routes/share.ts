import { Router } from "express";
import { z } from "zod";
import { all, get, newId, run } from "../db.js";
import { rateLimit } from "../lib/auth.js";
import { notFound } from "../lib/http.js";
import { serializeDesign, serializeProject, shoppingList, type DesignRow, type ProjectRow } from "../lib/projects.js";

// Public, read-only project view for family, clients and contractors.
export const shareRouter = Router();

const sharedProject = (token: string) => {
  const p = get<ProjectRow & { owner_name: string; company: string | null }>(
    "SELECT p.*, u.name AS owner_name, u.company FROM projects p JOIN users u ON u.id = p.user_id WHERE p.share_token = ?", token);
  if (!p) throw notFound("Shared project");
  return p;
};

shareRouter.get("/share/:token", (req, res) => {
  const p = sharedProject(String(req.params.token));
  const { shareToken: _omit, clientId: _c, ...project } = serializeProject(p);
  res.json({
    project,
    owner: { name: p.owner_name, company: p.company },
    designs: all<DesignRow>("SELECT * FROM designs WHERE project_id = ? ORDER BY favorite DESC, created_at DESC", p.id).map(serializeDesign),
    comments: all("SELECT id, design_id AS designId, author_name AS authorName, body, reaction, created_at AS createdAt, user_id IS NOT NULL AS isOwner FROM comments WHERE project_id = ? ORDER BY created_at", p.id),
    shopping: shoppingList(p.id).map(({ product, quantity }) => ({ product, quantity })),
  });
});

shareRouter.post("/share/:token/comments", rateLimit(10, 60_000), (req, res) => {
  const p = sharedProject(String(req.params.token));
  const b = z.object({
    authorName: z.string().trim().min(1).max(60),
    body: z.string().trim().min(1).max(1000),
    designId: z.string().nullable().optional(),
    reaction: z.enum(["love", "like", "unsure", "dislike"]).nullable().optional(),
  }).parse(req.body);
  if (b.designId && !get("SELECT id FROM designs WHERE id = ? AND project_id = ?", b.designId, p.id)) throw notFound("Design");
  run("INSERT INTO comments (id, project_id, design_id, author_name, body, reaction) VALUES (?, ?, ?, ?, ?, ?)",
    newId(), p.id, b.designId ?? null, b.authorName, b.body, b.reaction ?? null);
  res.status(201).json({ ok: true });
});
