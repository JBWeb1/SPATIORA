import { Router } from "express";
import { z } from "zod";
import { all, get, newId, run } from "../db.js";
import { currentUser, requireAuth, requirePro } from "../lib/auth.js";
import { notFound } from "../lib/http.js";
import { ownedProject, serializeProject, shoppingList } from "../lib/projects.js";
import { CONTRACTORS, VAT_RATE } from "../data/catalog.js";
import { estimate } from "../services/estimator.js";

export const workspaceRouter = Router();
workspaceRouter.use(requireAuth);

// --------------------------- Contractor quote requests (all plans) -------------------

workspaceRouter.post("/contractors/:id/requests", (req, res) => {
  const user = currentUser(req);
  const contractor = CONTRACTORS.find((c) => c.id === String(req.params.id));
  if (!contractor) throw notFound("Contractor");
  const b = z.object({ projectId: z.string().nullable().optional(), message: z.string().trim().min(10).max(3000) }).parse(req.body);
  if (b.projectId) ownedProject(req, b.projectId);
  const id = newId();
  run("INSERT INTO contractor_requests (id, user_id, project_id, contractor_id, message) VALUES (?, ?, ?, ?, ?)", id, user.id, b.projectId ?? null, contractor.id, b.message);
  res.status(201).json({ request: { id, contractor: contractor.name, status: "sent", expectedResponseHours: contractor.responseHours } });
});

workspaceRouter.get("/contractor-requests", (req, res) => {
  const rows = all<{ id: string; contractor_id: string; project_id: string | null; project_name: string | null; message: string; status: string; created_at: string }>(
    `SELECT r.*, p.name AS project_name FROM contractor_requests r LEFT JOIN projects p ON p.id = r.project_id WHERE r.user_id = ? ORDER BY r.created_at DESC`, currentUser(req).id);
  res.json({ requests: rows.map((r) => ({
    id: r.id, contractor: CONTRACTORS.find((c) => c.id === r.contractor_id), projectId: r.project_id, projectName: r.project_name,
    message: r.message, status: r.status, createdAt: r.created_at,
  })) });
});

// ------------------------------- Clients (Pro) ----------------------------------------

const clientSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().or(z.literal("")).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(300).nullable().optional(),
  notes: z.string().max(3000).nullable().optional(),
});

workspaceRouter.get("/clients", requirePro, (req, res) => {
  res.json({ clients: all(
    `SELECT c.id, c.name, c.email, c.phone, c.address, c.notes, c.created_at AS createdAt,
            (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS projectCount,
            (SELECT COUNT(*) FROM quotes q WHERE q.client_id = c.id) AS quoteCount
     FROM clients c WHERE c.user_id = ? ORDER BY c.name`, currentUser(req).id) });
});

workspaceRouter.post("/clients", requirePro, (req, res) => {
  const b = clientSchema.parse(req.body);
  const id = newId();
  run("INSERT INTO clients (id, user_id, name, email, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id, currentUser(req).id, b.name, b.email || null, b.phone ?? null, b.address ?? null, b.notes ?? null);
  res.status(201).json({ client: get("SELECT * FROM clients WHERE id = ?", id) });
});

workspaceRouter.patch("/clients/:id", requirePro, (req, res) => {
  const user = currentUser(req);
  const c = get<Record<string, string | null>>("SELECT * FROM clients WHERE id = ? AND user_id = ?", String(req.params.id), user.id);
  if (!c) throw notFound("Client");
  const b = clientSchema.partial().parse(req.body);
  run("UPDATE clients SET name = ?, email = ?, phone = ?, address = ?, notes = ? WHERE id = ?",
    b.name ?? c.name, b.email === undefined ? c.email : b.email || null, b.phone === undefined ? c.phone : b.phone,
    b.address === undefined ? c.address : b.address, b.notes === undefined ? c.notes : b.notes, c.id as string);
  res.json({ client: get("SELECT * FROM clients WHERE id = ?", c.id as string) });
});

workspaceRouter.delete("/clients/:id", requirePro, (req, res) => {
  const r = run("DELETE FROM clients WHERE id = ? AND user_id = ?", String(req.params.id), currentUser(req).id);
  if (!r.changes) throw notFound("Client");
  res.status(204).end();
});

// ------------------------------- Quotes (Pro) -----------------------------------------

const quoteItem = z.object({
  description: z.string().trim().min(1).max(300),
  quantity: z.number().min(0),
  unit: z.string().max(20).default("ea"),
  unitPrice: z.number().min(0),
  category: z.string().max(40).default("General"),
});

const quoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  projectId: z.string().nullable().optional(),
  clientId: z.string().nullable().optional(),
  items: z.array(quoteItem).max(300),
  vatRate: z.number().min(0).max(0.5).default(VAT_RATE),
  markup: z.number().min(0).max(1).default(0),
  status: z.enum(["draft", "sent", "accepted", "declined"]).default("draft"),
  notes: z.string().max(5000).nullable().optional(),
  validUntil: z.string().nullable().optional(),
});

type QuoteRow = { id: string; number: string; title: string; project_id: string | null; client_id: string | null; items: string; vat_rate: number; markup: number; currency: string; status: string; notes: string | null; valid_until: string | null; created_at: string; client_name?: string | null; project_name?: string | null };

function serializeQuote(q: QuoteRow) {
  const items = JSON.parse(q.items) as z.infer<typeof quoteItem>[];
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const markup = subtotal * q.markup;
  const vat = (subtotal + markup) * q.vat_rate;
  return {
    id: q.id, number: q.number, title: q.title, projectId: q.project_id, clientId: q.client_id, clientName: q.client_name ?? null, projectName: q.project_name ?? null,
    items, vatRate: q.vat_rate, markup: q.markup, currency: q.currency, status: q.status, notes: q.notes, validUntil: q.valid_until, createdAt: q.created_at,
    totals: { subtotal: Math.round(subtotal * 100) / 100, markup: Math.round(markup * 100) / 100, vat: Math.round(vat * 100) / 100, total: Math.round((subtotal + markup + vat) * 100) / 100 },
  };
}

const quoteQuery = `SELECT q.*, c.name AS client_name, p.name AS project_name FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LEFT JOIN projects p ON p.id = q.project_id`;

function checkRefs(req: Parameters<typeof ownedProject>[0], b: { projectId?: string | null; clientId?: string | null }) {
  if (b.projectId) ownedProject(req, b.projectId);
  if (b.clientId && !get("SELECT id FROM clients WHERE id = ? AND user_id = ?", b.clientId, currentUser(req).id)) throw notFound("Client");
}

function nextNumber(userId: string) {
  const n = get<{ n: number }>("SELECT COUNT(*) AS n FROM quotes WHERE user_id = ?", userId)!.n + 1;
  return `VQ-${new Date().getFullYear()}-${String(n).padStart(4, "0")}`;
}

workspaceRouter.get("/quotes", requirePro, (req, res) => {
  res.json({ quotes: all<QuoteRow>(`${quoteQuery} WHERE q.user_id = ? ORDER BY q.created_at DESC`, currentUser(req).id).map(serializeQuote) });
});

workspaceRouter.get("/quotes/:id", requirePro, (req, res) => {
  const q = get<QuoteRow>(`${quoteQuery} WHERE q.id = ? AND q.user_id = ?`, String(req.params.id), currentUser(req).id);
  if (!q) throw notFound("Quote");
  res.json({ quote: serializeQuote(q) });
});

workspaceRouter.post("/quotes", requirePro, (req, res) => {
  const user = currentUser(req);
  const b = quoteSchema.parse(req.body);
  checkRefs(req, b);
  const id = newId();
  run(`INSERT INTO quotes (id, user_id, project_id, client_id, number, title, items, vat_rate, markup, currency, status, notes, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, user.id, b.projectId ?? null, b.clientId ?? null, nextNumber(user.id), b.title, JSON.stringify(b.items), b.vatRate, b.markup, user.currency, b.status, b.notes ?? null, b.validUntil ?? null);
  res.status(201).json({ quote: serializeQuote(get<QuoteRow>(`${quoteQuery} WHERE q.id = ?`, id)!) });
});

workspaceRouter.post("/quotes/from-project/:projectId", requirePro, (req, res) => {
  const user = currentUser(req);
  const p = ownedProject(req, String(req.params.projectId));
  const sp = serializeProject(p);
  const f = sp.finishes as Record<string, string | number>;
  const est = estimate(sp.room, {
    flooring: f.flooring as string, wall: f.wall as string, ceiling: f.ceiling as string, tiles: f.tiles as string,
    tiledArea: Number(f.tiledArea ?? 0), countertop: f.countertop as string, countertopLength: Number(f.countertopLength ?? 0),
    cabinetry: f.cabinetry as string, cabinetryLength: Number(f.cabinetryLength ?? 0),
  }, { quality: "standard", province: user.province, includeDemolition: true, electricalPoints: 4, plumbingPoints: 0, contingency: 0 });
  const items = [
    ...est.lines.map((l) => ({ description: l.item, quantity: l.quantity, unit: l.unit, unitPrice: l.unitCost, category: l.group })),
    ...shoppingList(p.id).map((s) => ({ description: `${s.product!.name} (${s.product!.retailer})`, quantity: s.quantity, unit: "ea", unitPrice: Math.round((s.product!.price / (1 + VAT_RATE)) * 100) / 100, category: "Furniture & fixtures" })),
  ];
  const id = newId();
  const valid = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
  run(`INSERT INTO quotes (id, user_id, project_id, client_id, number, title, items, vat_rate, markup, currency, status, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    id, user.id, p.id, p.client_id, nextNumber(user.id), `${p.name} — renovation quotation`, JSON.stringify(items), VAT_RATE, 0.15, user.currency, valid);
  res.status(201).json({ quote: serializeQuote(get<QuoteRow>(`${quoteQuery} WHERE q.id = ?`, id)!) });
});

workspaceRouter.patch("/quotes/:id", requirePro, (req, res) => {
  const user = currentUser(req);
  const q = get<QuoteRow>("SELECT * FROM quotes WHERE id = ? AND user_id = ?", String(req.params.id), user.id);
  if (!q) throw notFound("Quote");
  const b = quoteSchema.partial().parse(req.body);
  checkRefs(req, b);
  run(`UPDATE quotes SET title = ?, project_id = ?, client_id = ?, items = ?, vat_rate = ?, markup = ?, status = ?, notes = ?, valid_until = ? WHERE id = ?`,
    b.title ?? q.title, b.projectId === undefined ? q.project_id : b.projectId, b.clientId === undefined ? q.client_id : b.clientId,
    b.items ? JSON.stringify(b.items) : q.items, b.vatRate ?? q.vat_rate, b.markup ?? q.markup, b.status ?? q.status,
    b.notes === undefined ? q.notes : b.notes, b.validUntil === undefined ? q.valid_until : b.validUntil, q.id);
  res.json({ quote: serializeQuote(get<QuoteRow>(`${quoteQuery} WHERE q.id = ?`, q.id)!) });
});

workspaceRouter.delete("/quotes/:id", requirePro, (req, res) => {
  const r = run("DELETE FROM quotes WHERE id = ? AND user_id = ?", String(req.params.id), currentUser(req).id);
  if (!r.changes) throw notFound("Quote");
  res.status(204).end();
});
