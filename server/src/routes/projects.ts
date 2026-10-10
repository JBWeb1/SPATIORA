import { Router } from "express";
import multer from "multer";
import crypto from "node:crypto";
import { z } from "zod";
import { all, get, newId, run, tx } from "../db.js";
import { currentUser, requireAuth } from "../lib/auth.js";
import { HttpError, notFound } from "../lib/http.js";
import { readUpload, saveImage, sniffMime } from "../lib/images.js";
import { DEFAULT_ROOM, ownedProject, serializeDesign, serializeProject, shoppingList, touch, type DesignRow, type ProjectRow } from "../lib/projects.js";
import { CURRENCIES, PLANS, PRODUCTS, ROOM_TYPES, STYLES } from "../data/catalog.js";
import { generateRedesign, type RedesignPreferences } from "../services/imageGen.js";
import { estimate } from "../services/estimator.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });

const roomSchema = z.object({
  length: z.number().min(1).max(40),
  width: z.number().min(1).max(40),
  height: z.number().min(2).max(8),
  doors: z.number().int().min(0).max(10),
  windows: z.number().int().min(0).max(20),
});

const layoutItem = z.object({
  id: z.string(),
  productId: z.string().optional(),
  name: z.string().max(120),
  color: z.string().max(20),
  x: z.number(), z: z.number(), rotation: z.number(),
  w: z.number().positive(), d: z.number().positive(), h: z.number().positive(),
});

const moodItem = z.object({
  id: z.string(),
  kind: z.enum(["color", "material", "product", "image", "note"]),
  value: z.string().max(2000),
  label: z.string().max(120).optional(),
});

const projectPatch = z.object({
  name: z.string().trim().min(1).max(120),
  roomType: z.enum(ROOM_TYPES),
  description: z.string().max(2000).nullable(),
  status: z.enum(["planning", "designing", "quoting", "in-progress", "complete"]),
  budget: z.number().min(0).max(1e9),
  currency: z.string().refine((c) => c in CURRENCIES),
  room: roomSchema,
  layout: z.array(layoutItem).max(200),
  finishes: z.record(z.string(), z.union([z.string(), z.number(), z.null()])),
  moodboard: z.array(moodItem).max(100),
  tags: z.array(z.string().max(30)).max(12),
  clientId: z.string().nullable(),
}).partial();

// ---------------------------------- Projects ----------------------------------------

projectsRouter.get("/projects", (req, res) => {
  const user = currentUser(req);
  const rows = all<ProjectRow & { design_count: number; favorite_image: string | null }>(
    `SELECT p.*, (SELECT COUNT(*) FROM designs d WHERE d.project_id = p.id) AS design_count,
            (SELECT result_image FROM designs d WHERE d.project_id = p.id ORDER BY favorite DESC, created_at DESC LIMIT 1) AS favorite_image
     FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC`,
    user.id,
  );
  res.json({ projects: rows.map((r) => ({ ...serializeProject(r), designCount: r.design_count, coverImage: r.cover_image ?? r.favorite_image ?? r.source_image })) });
});

projectsRouter.post("/projects", (req, res) => {
  const user = currentUser(req);
  const body = z.object({
    name: z.string().trim().min(1).max(120),
    roomType: z.enum(ROOM_TYPES),
    description: z.string().max(2000).optional(),
    budget: z.number().min(0).max(1e9).optional(),
    room: roomSchema.partial().optional(),
    clientId: z.string().optional(),
    style: z.string().optional(),
  }).parse(req.body);
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?", user.id)!.n;
  const limit = PLANS[user.plan]?.maxProjects ?? PLANS.free.maxProjects;
  if (count >= limit) throw new HttpError(402, `Your ${PLANS[user.plan].name} plan allows ${limit} projects. Upgrade to add more.`, "upgrade_required");
  if (body.clientId && !get("SELECT id FROM clients WHERE id = ? AND user_id = ?", body.clientId, user.id)) throw notFound("Client");

  const id = newId();
  const finishes = body.style && STYLES.some((s) => s.id === body.style) ? { style: body.style } : {};
  run(
    `INSERT INTO projects (id, user_id, client_id, name, room_type, description, budget, currency, room, finishes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, user.id, body.clientId ?? null, body.name, body.roomType, body.description ?? null, body.budget ?? 0, user.currency,
    JSON.stringify({ ...DEFAULT_ROOM, ...body.room }), JSON.stringify(finishes),
  );
  res.status(201).json({ project: serializeProject(get<ProjectRow>("SELECT * FROM projects WHERE id = ?", id)!) });
});

projectsRouter.get("/projects/:id", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  res.json({
    project: serializeProject(p),
    designs: all<DesignRow>("SELECT * FROM designs WHERE project_id = ? ORDER BY created_at DESC", p.id).map(serializeDesign),
    comments: all("SELECT id, design_id AS designId, author_name AS authorName, body, reaction, created_at AS createdAt, user_id IS NOT NULL AS isOwner FROM comments WHERE project_id = ? ORDER BY created_at", p.id),
    shopping: shoppingList(p.id),
  });
});

// Lightweight change signal so open project pages update themselves live.
projectsRouter.get("/projects/:id/pulse", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const counts = get<{ comments: number; designs: number }>(
    "SELECT (SELECT COUNT(*) FROM comments WHERE project_id = ?) AS comments, (SELECT COUNT(*) FROM designs WHERE project_id = ?) AS designs", p.id, p.id)!;
  const latest = get<{ authorName: string; body: string; isOwner: number }>(
    "SELECT author_name AS authorName, body, user_id IS NOT NULL AS isOwner FROM comments WHERE project_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1", p.id);
  res.setHeader("Cache-Control", "no-store");
  res.json({ updatedAt: p.updated_at, ...counts, latestComment: latest ?? null });
});

projectsRouter.patch("/projects/:id", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const b = projectPatch.parse(req.body);
  const user = currentUser(req);
  if (b.clientId && !get("SELECT id FROM clients WHERE id = ? AND user_id = ?", b.clientId, user.id)) throw notFound("Client");
  const cur = serializeProject(p);
  run(
    `UPDATE projects SET name = ?, room_type = ?, description = ?, status = ?, budget = ?, currency = ?, room = ?, layout = ?, finishes = ?, moodboard = ?, tags = ?, client_id = ?, updated_at = datetime('now') WHERE id = ?`,
    b.name ?? cur.name,
    b.roomType ?? cur.roomType,
    b.description === undefined ? cur.description : b.description,
    b.status ?? cur.status,
    b.budget ?? cur.budget,
    b.currency ?? cur.currency,
    JSON.stringify(b.room ?? cur.room),
    JSON.stringify(b.layout ?? cur.layout),
    JSON.stringify(b.finishes ?? cur.finishes),
    JSON.stringify(b.moodboard ?? cur.moodboard),
    JSON.stringify(b.tags ?? cur.tags),
    b.clientId === undefined ? cur.clientId : b.clientId,
    p.id,
  );
  res.json({ project: serializeProject(get<ProjectRow>("SELECT * FROM projects WHERE id = ?", p.id)!) });
});

projectsRouter.delete("/projects/:id", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  run("DELETE FROM projects WHERE id = ?", p.id);
  res.status(204).end();
});

projectsRouter.post("/projects/:id/duplicate", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const user = currentUser(req);
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?", user.id)!.n;
  if (count >= PLANS[user.plan].maxProjects) throw new HttpError(402, "Project limit reached for your plan", "upgrade_required");
  const id = newId();
  tx(() => {
    run(
      `INSERT INTO projects (id, user_id, client_id, name, room_type, description, status, budget, currency, source_image, cover_image, room, layout, finishes, moodboard, tags)
       SELECT ?, user_id, client_id, name || ' (copy)', room_type, description, 'planning', budget, currency, source_image, cover_image, room, layout, finishes, moodboard, tags FROM projects WHERE id = ?`,
      id, p.id,
    );
    run(
      `INSERT INTO designs (id, project_id, style, prompt, preferences, source_image, result_image, provider, favorite, notes)
       SELECT lower(hex(randomblob(16))), ?, style, prompt, preferences, source_image, result_image, provider, favorite, notes FROM designs WHERE project_id = ?`,
      id, p.id,
    );
  });
  res.status(201).json({ project: serializeProject(get<ProjectRow>("SELECT * FROM projects WHERE id = ?", id)!) });
});

projectsRouter.post("/projects/:id/photo", upload.single("photo"), (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  if (!req.file) throw new HttpError(400, "Attach a room photo (JPG, PNG or WebP)");
  const mime = sniffMime(req.file.buffer);
  if (!mime) throw new HttpError(415, "Only JPG, PNG or WebP photos are supported");
  const url = saveImage(req.file.buffer, mime);
  run("UPDATE projects SET source_image = ?, updated_at = datetime('now') WHERE id = ?", url, p.id);
  res.json({ project: serializeProject(get<ProjectRow>("SELECT * FROM projects WHERE id = ?", p.id)!) });
});

projectsRouter.post("/projects/:id/share", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body);
  const token = enabled ? p.share_token ?? crypto.randomBytes(12).toString("base64url") : null;
  run("UPDATE projects SET share_token = ? WHERE id = ?", token, p.id);
  res.json({ shareToken: token });
});

projectsRouter.post("/projects/:id/cover", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const { designId } = z.object({ designId: z.string() }).parse(req.body);
  const d = get<DesignRow>("SELECT * FROM designs WHERE id = ? AND project_id = ?", designId, p.id);
  if (!d) throw notFound("Design");
  run("UPDATE projects SET cover_image = ?, updated_at = datetime('now') WHERE id = ?", d.result_image, p.id);
  res.json({ ok: true });
});

// ---------------------------------- Designs -----------------------------------------

const prefsSchema = z.object({
  colors: z.array(z.string().max(30)).max(6).optional(),
  materials: z.array(z.string().max(60)).max(8).optional(),
  furniture: z.string().max(300).optional(),
  lighting: z.string().max(300).optional(),
  budget: z.number().min(0).optional(),
  preserveLayout: z.boolean().optional(),
  intensity: z.number().min(0.1).max(1).optional(),
  extraPrompt: z.string().max(500).optional(),
});

projectsRouter.post("/projects/:id/designs", async (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const user = currentUser(req);
  const body = z.object({
    styleId: z.string().refine((s) => STYLES.some((x) => x.id === s), "Unknown style"),
    preferences: prefsSchema.default({}),
    variants: z.number().int().min(1).max(4).default(2),
  }).parse(req.body);

  const month = new Date().toISOString().slice(0, 7);
  const used = get<{ generations: number }>("SELECT generations FROM usage WHERE user_id = ? AND month = ?", user.id, month)?.generations ?? 0;
  const allowance = PLANS[user.plan].monthlyGenerations;
  if (used + body.variants > allowance) {
    throw new HttpError(402, `You've used ${used} of ${allowance} AI redesigns this month on the ${PLANS[user.plan].name} plan.`, "upgrade_required");
  }

  const source = readUpload(p.source_image);
  const preferences: RedesignPreferences = body.preferences;
  const created: DesignRow[] = [];
  for (let v = 0; v < body.variants; v++) {
    const result = await generateRedesign({ roomType: p.room_type, styleId: body.styleId, preferences, source, variant: v });
    const id = newId();
    run(
      `INSERT INTO designs (id, project_id, style, prompt, preferences, source_image, result_image, provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, p.id, body.styleId, result.prompt, JSON.stringify(preferences), p.source_image, result.imageUrl, result.provider,
    );
    created.push(get<DesignRow>("SELECT * FROM designs WHERE id = ?", id)!);
  }
  run(
    `INSERT INTO usage (user_id, month, generations) VALUES (?, ?, ?) ON CONFLICT(user_id, month) DO UPDATE SET generations = generations + excluded.generations`,
    user.id, month, created.length,
  );
  const finishes = serializeProject(p).finishes;
  run("UPDATE projects SET finishes = ?, status = CASE WHEN status = 'planning' THEN 'designing' ELSE status END, updated_at = datetime('now') WHERE id = ?",
    JSON.stringify({ ...finishes, style: body.styleId }), p.id);
  res.status(201).json({ designs: created.map(serializeDesign), usage: { used: used + created.length, allowance } });
});

function ownedDesign(req: Parameters<typeof ownedProject>[0], id: string) {
  const user = currentUser(req);
  const d = get<DesignRow>("SELECT d.* FROM designs d JOIN projects p ON p.id = d.project_id WHERE d.id = ? AND p.user_id = ?", id, user.id);
  if (!d) throw notFound("Design");
  return d;
}

projectsRouter.patch("/designs/:id", (req, res) => {
  const d = ownedDesign(req, String(req.params.id));
  const b = z.object({ favorite: z.boolean().optional(), notes: z.string().max(2000).nullable().optional() }).parse(req.body);
  run("UPDATE designs SET favorite = ?, notes = ? WHERE id = ?", b.favorite === undefined ? d.favorite : Number(b.favorite), b.notes === undefined ? d.notes : b.notes, d.id);
  touch(d.project_id);
  res.json({ design: serializeDesign(get<DesignRow>("SELECT * FROM designs WHERE id = ?", d.id)!) });
});

projectsRouter.delete("/designs/:id", (req, res) => {
  const d = ownedDesign(req, String(req.params.id));
  run("DELETE FROM designs WHERE id = ?", d.id);
  res.status(204).end();
});

// ---------------------------------- Estimate ----------------------------------------

const estimateOptions = z.object({
  quality: z.enum(["budget", "standard", "premium"]).default("standard"),
  includeDemolition: z.boolean().default(false),
  electricalPoints: z.number().int().min(0).max(200).default(0),
  plumbingPoints: z.number().int().min(0).max(100).default(0),
  contingency: z.number().min(0).max(0.3).default(0.1),
});

projectsRouter.post("/projects/:id/estimate", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const opts = estimateOptions.parse(req.body ?? {});
  const sp = serializeProject(p);
  const f = sp.finishes as Record<string, string | number | undefined>;
  const result = estimate(sp.room, {
    flooring: f.flooring as string, wall: f.wall as string, ceiling: f.ceiling as string, tiles: f.tiles as string,
    tiledArea: Number(f.tiledArea ?? 0), countertop: f.countertop as string, countertopLength: Number(f.countertopLength ?? 0),
    cabinetry: f.cabinetry as string, cabinetryLength: Number(f.cabinetryLength ?? 0),
  }, { ...opts, province: currentUser(req).province });
  const furniture = shoppingList(p.id).reduce((s, i) => s + i.product!.price * i.quantity, 0);
  res.json({ estimate: result, furnitureTotal: furniture, budget: sp.budget, grandTotal: result.totals.total + furniture });
});

// ---------------------------------- Shopping ----------------------------------------

projectsRouter.post("/projects/:id/shopping", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const b = z.object({ productId: z.string(), quantity: z.number().int().min(1).max(500).default(1) }).parse(req.body);
  if (!PRODUCTS.some((x) => x.id === b.productId)) throw notFound("Product");
  const existing = get<{ id: string }>("SELECT id FROM shopping_items WHERE project_id = ? AND product_id = ?", p.id, b.productId);
  if (existing) run("UPDATE shopping_items SET quantity = quantity + ? WHERE id = ?", b.quantity, existing.id);
  else run("INSERT INTO shopping_items (id, project_id, product_id, quantity) VALUES (?, ?, ?, ?)", newId(), p.id, b.productId, b.quantity);
  touch(p.id);
  res.status(201).json({ shopping: shoppingList(p.id) });
});

function ownedShoppingItem(req: Parameters<typeof ownedProject>[0], id: string) {
  const row = get<{ id: string; project_id: string }>(
    "SELECT s.id, s.project_id FROM shopping_items s JOIN projects p ON p.id = s.project_id WHERE s.id = ? AND p.user_id = ?", id, currentUser(req).id);
  if (!row) throw notFound("Shopping item");
  return row;
}

projectsRouter.patch("/shopping/:id", (req, res) => {
  const row = ownedShoppingItem(req, String(req.params.id));
  const b = z.object({ quantity: z.number().int().min(1).max(500).optional(), purchased: z.boolean().optional() }).parse(req.body);
  if (b.quantity !== undefined) run("UPDATE shopping_items SET quantity = ? WHERE id = ?", b.quantity, row.id);
  if (b.purchased !== undefined) run("UPDATE shopping_items SET purchased = ? WHERE id = ?", Number(b.purchased), row.id);
  res.json({ shopping: shoppingList(row.project_id) });
});

projectsRouter.delete("/shopping/:id", (req, res) => {
  const row = ownedShoppingItem(req, String(req.params.id));
  run("DELETE FROM shopping_items WHERE id = ?", row.id);
  res.json({ shopping: shoppingList(row.project_id) });
});

// ---------------------------------- Comments ----------------------------------------

projectsRouter.post("/projects/:id/comments", (req, res) => {
  const p = ownedProject(req, String(req.params.id));
  const user = currentUser(req);
  const b = z.object({ body: z.string().trim().min(1).max(2000), designId: z.string().nullable().optional() }).parse(req.body);
  if (b.designId && !get("SELECT id FROM designs WHERE id = ? AND project_id = ?", b.designId, p.id)) throw notFound("Design");
  run("INSERT INTO comments (id, project_id, design_id, user_id, author_name, body) VALUES (?, ?, ?, ?, ?, ?)", newId(), p.id, b.designId ?? null, user.id, user.name, b.body);
  res.status(201).json({ ok: true });
});

projectsRouter.delete("/comments/:id", (req, res) => {
  const row = get<{ id: string }>("SELECT c.id FROM comments c JOIN projects p ON p.id = c.project_id WHERE c.id = ? AND p.user_id = ?", String(req.params.id), currentUser(req).id);
  if (!row) throw notFound("Comment");
  run("DELETE FROM comments WHERE id = ?", row.id);
  res.status(204).end();
});

// ---------------------------------- Dashboard ---------------------------------------

projectsRouter.get("/dashboard", (req, res) => {
  const user = currentUser(req);
  const month = new Date().toISOString().slice(0, 7);
  const stats = get<{ projects: number; designs: number; favorites: number; budget: number }>(
    `SELECT COUNT(DISTINCT p.id) AS projects, COUNT(d.id) AS designs, COALESCE(SUM(d.favorite), 0) AS favorites,
            (SELECT COALESCE(SUM(budget), 0) FROM projects WHERE user_id = ?) AS budget
     FROM projects p LEFT JOIN designs d ON d.project_id = p.id WHERE p.user_id = ?`, user.id, user.id)!;
  const usage = get<{ generations: number }>("SELECT generations FROM usage WHERE user_id = ? AND month = ?", user.id, month)?.generations ?? 0;
  const recentComments = all(
    `SELECT c.author_name AS authorName, c.body, c.created_at AS createdAt, p.name AS projectName, p.id AS projectId
     FROM comments c JOIN projects p ON p.id = c.project_id WHERE p.user_id = ? AND c.user_id IS NULL ORDER BY c.created_at DESC LIMIT 5`, user.id);
  const openTasks = all(
    `SELECT t.title, t.end_date AS endDate, p.name AS projectName, p.id AS projectId FROM tasks t JOIN projects p ON p.id = t.project_id
     WHERE p.user_id = ? AND t.status != 'done' ORDER BY COALESCE(t.end_date, '9999') LIMIT 6`, user.id);
  res.json({ stats, usage: { used: usage, allowance: PLANS[user.plan].monthlyGenerations }, recentComments, openTasks });
});
