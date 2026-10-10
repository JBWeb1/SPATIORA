import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { get, newId, run } from "../db.js";
import { currentUser, publicUser, rateLimit, requireAuth, signToken, type UserRow } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import { CURRENCIES, PLANS, PROVINCES } from "../data/catalog.js";

export const authRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
  accountType: z.enum(["homeowner", "designer", "contractor", "developer"]).default("homeowner"),
  company: z.string().trim().max(120).optional(),
  province: z.string().optional(),
});

authRouter.post("/register", rateLimit(20, 60_000), async (req, res) => {
  const body = registerSchema.parse(req.body);
  if (get("SELECT id FROM users WHERE email = ?", body.email)) throw new HttpError(409, "An account with this email already exists");
  const id = newId();
  const hash = await bcrypt.hash(body.password, 10);
  const province = PROVINCES.some((p) => p.name === body.province) ? body.province! : "Gauteng";
  run(
    "INSERT INTO users (id, email, name, password_hash, account_type, company, province) VALUES (?, ?, ?, ?, ?, ?, ?)",
    id, body.email, body.name, hash, body.accountType, body.company ?? null, province,
  );
  const user = get<UserRow>("SELECT * FROM users WHERE id = ?", id)!;
  res.status(201).json({ token: signToken(id), user: publicUser(user) });
});

authRouter.post("/login", rateLimit(30, 60_000), async (req, res) => {
  const body = z.object({ email: z.string().trim().toLowerCase(), password: z.string() }).parse(req.body);
  const user = get<UserRow>("SELECT * FROM users WHERE email = ?", body.email);
  if (!user || !(await bcrypt.compare(body.password, user.password_hash))) throw new HttpError(401, "Incorrect email or password");
  res.json({ token: signToken(user.id), user: publicUser(user) });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const user = currentUser(req);
  const month = new Date().toISOString().slice(0, 7);
  const usage = get<{ generations: number }>("SELECT generations FROM usage WHERE user_id = ? AND month = ?", user.id, month);
  const projects = get<{ n: number }>("SELECT COUNT(*) AS n FROM projects WHERE user_id = ?", user.id)!;
  res.json({ user: publicUser(user), usage: { month, generations: usage?.generations ?? 0, projects: projects.n } });
});

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  currency: z.string().refine((c) => c in CURRENCIES, "Unsupported currency").optional(),
  province: z.string().refine((p) => PROVINCES.some((x) => x.name === p), "Unknown province").optional(),
  accountType: z.enum(["homeowner", "designer", "contractor", "developer"]).optional(),
  company: z.string().trim().max(120).nullable().optional(),
  styleProfile: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    scores: z.record(z.string(), z.number()),
    palette: z.array(z.string()).max(8).optional(),
  }).nullable().optional(),
});

authRouter.patch("/me", requireAuth, (req, res) => {
  const user = currentUser(req);
  const b = profileSchema.parse(req.body);
  run(
    `UPDATE users SET name = ?, currency = ?, province = ?, account_type = ?, company = ?, style_profile = ? WHERE id = ?`,
    b.name ?? user.name,
    b.currency ?? user.currency,
    b.province ?? user.province,
    b.accountType ?? user.account_type,
    b.company === undefined ? user.company : b.company,
    b.styleProfile === undefined ? user.style_profile : b.styleProfile ? JSON.stringify(b.styleProfile) : null,
    user.id,
  );
  res.json({ user: publicUser(get<UserRow>("SELECT * FROM users WHERE id = ?", user.id)!) });
});

// Demo subscription switcher. Replace with a payment provider (e.g. PayFast, Paystack or
// Stripe) webhook that sets the plan once payment succeeds.
authRouter.post("/me/plan", requireAuth, (req, res) => {
  const { plan } = z.object({ plan: z.enum(Object.keys(PLANS) as [keyof typeof PLANS, ...(keyof typeof PLANS)[]]) }).parse(req.body);
  const user = currentUser(req);
  run("UPDATE users SET plan = ? WHERE id = ?", plan, user.id);
  res.json({ user: publicUser(get<UserRow>("SELECT * FROM users WHERE id = ?", user.id)!) });
});

authRouter.post("/me/password", requireAuth, async (req, res) => {
  const b = z.object({ current: z.string(), next: z.string().min(8).max(200) }).parse(req.body);
  const user = currentUser(req);
  if (!(await bcrypt.compare(b.current, user.password_hash))) throw new HttpError(400, "Current password is incorrect");
  run("UPDATE users SET password_hash = ? WHERE id = ?", await bcrypt.hash(b.next, 10), user.id);
  res.json({ ok: true });
});

authRouter.delete("/me", requireAuth, (req, res) => {
  run("DELETE FROM users WHERE id = ?", currentUser(req).id);
  res.status(204).end();
});
