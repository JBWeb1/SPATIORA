import { Router } from "express";
import { z } from "zod";
import { all, get, newId, parseJson, run } from "../db.js";
import { currentUser, requireAuth } from "../lib/auth.js";
import { notFound } from "../lib/http.js";
import { ownedProject, serializeProject } from "../lib/projects.js";
import { PRODUCTS, STYLES } from "../data/catalog.js";
import { optimise } from "../services/optimiser.js";
import { estimateProject, finishesOf } from "../lib/estimateProject.js";

export const engagementRouter = Router();
engagementRouter.use(requireAuth);

// ------------------------------ Notifications ---------------------------------------

engagementRouter.get("/notifications", (req, res) => {
  const user = currentUser(req);
  const items = all<{ id: string; kind: string; title: string; body: string | null; link: string | null; read: number; created_at: string }>(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 40", user.id);
  const unread = get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", user.id)!.n;
  res.setHeader("Cache-Control", "no-store");
  res.json({ unread, notifications: items.map((n) => ({ id: n.id, kind: n.kind, title: n.title, body: n.body, link: n.link, read: !!n.read, createdAt: n.created_at })) });
});

engagementRouter.post("/notifications/read", (req, res) => {
  const user = currentUser(req);
  const { ids } = z.object({ ids: z.array(z.string()).max(200).optional() }).parse(req.body ?? {});
  if (ids?.length) for (const id of ids) run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", id, user.id);
  else run("UPDATE notifications SET read = 1 WHERE user_id = ?", user.id);
  res.json({ ok: true });
});

// -------------------------------- Watchlist -----------------------------------------

const watchlist = (userId: string) =>
  all<{ product_id: string; price_at_add: number; created_at: string }>("SELECT product_id, price_at_add, created_at FROM watchlist WHERE user_id = ? ORDER BY created_at DESC", userId)
    .map((w) => ({ product: PRODUCTS.find((p) => p.id === w.product_id) ?? null, priceAtAdd: w.price_at_add, createdAt: w.created_at }))
    .filter((w) => w.product);

engagementRouter.get("/watchlist", (req, res) => res.json({ items: watchlist(currentUser(req).id) }));

engagementRouter.post("/watchlist", (req, res) => {
  const user = currentUser(req);
  const { productId } = z.object({ productId: z.string() }).parse(req.body);
  const product = PRODUCTS.find((p) => p.id === productId);
  if (!product) throw notFound("Product");
  run("INSERT INTO watchlist (user_id, product_id, price_at_add) VALUES (?, ?, ?) ON CONFLICT(user_id, product_id) DO NOTHING", user.id, productId, product.price);
  res.status(201).json({ items: watchlist(user.id) });
});

engagementRouter.delete("/watchlist/:productId", (req, res) => {
  const user = currentUser(req);
  run("DELETE FROM watchlist WHERE user_id = ? AND product_id = ?", user.id, String(req.params.productId));
  res.json({ items: watchlist(user.id) });
});

// ------------------------------ Layout versions -------------------------------------

engagementRouter.get("/projects/:id/layout-versions", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const rows = all<{ id: string; name: string; room: string; layout: string; finishes: string; created_at: string }>(
    "SELECT * FROM layout_versions WHERE project_id = ? ORDER BY created_at DESC, rowid DESC", p.id);
  res.json({ versions: rows.map((v) => ({ id: v.id, name: v.name, room: parseJson(v.room, {}), layout: parseJson(v.layout, []), finishes: parseJson(v.finishes, {}), createdAt: v.created_at })) });
});

engagementRouter.post("/projects/:id/layout-versions", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(req.body);
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM layout_versions WHERE project_id = ?", p.id)!.n;
  if (count >= 50) run("DELETE FROM layout_versions WHERE id = (SELECT id FROM layout_versions WHERE project_id = ? ORDER BY created_at, rowid LIMIT 1)", p.id);
  run("INSERT INTO layout_versions (id, project_id, name, room, layout, finishes) VALUES (?, ?, ?, ?, ?, ?)", newId(), p.id, name, p.room, p.layout, p.finishes);
  res.status(201).json({ ok: true });
});

engagementRouter.delete("/layout-versions/:id", (req, res) => {
  const row = get<{ id: string }>("SELECT v.id FROM layout_versions v JOIN projects p ON p.id = v.project_id WHERE v.id = ? AND p.user_id = ?", String(req.params.id), currentUser(req).id);
  if (!row) throw notFound("Version");
  run("DELETE FROM layout_versions WHERE id = ?", row.id);
  res.status(204).end();
});

// ------------------------------ Budget optimiser ------------------------------------

engagementRouter.post("/projects/:id/optimise", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const opts = z.object({
    quality: z.enum(["budget", "standard", "premium"]).default("standard"),
    includeDemolition: z.boolean().default(false),
    electricalPoints: z.number().int().min(0).max(200).default(0),
    plumbingPoints: z.number().int().min(0).max(100).default(0),
    contingency: z.number().min(0).max(0.3).default(0.1),
  }).parse(req.body ?? {});
  const sp = serializeProject(p);
  const style = STYLES.find((s) => s.id === (sp.finishes as Record<string, unknown>).style);
  const fullOpts = { ...opts, province: currentUser(req).province };
  const result = optimise(finishesOf(sp), fullOpts, (f, o) => estimateProject(sp, o, f).totals.total, style?.materials ?? []);
  res.json(result);
});
