import { Router, type NextFunction, type Request, type Response } from "express";
import { all, get } from "../db.js";
import { currentUser, requireAuth } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import { config } from "../config.js";
import { PLANS, PRODUCTS, STYLES } from "../data/catalog.js";

export const isAdminEmail = (email: string) => config.adminEmails.includes(email.toLowerCase());

function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!isAdminEmail(currentUser(req).email)) return next(new HttpError(403, "Admins only"));
  next();
}

export const adminRouter = Router();
adminRouter.use("/admin", requireAuth, requireAdmin);

adminRouter.get("/admin/stats", (_req, res) => {
  const month = new Date().toISOString().slice(0, 7);
  const plans = all<{ plan: keyof typeof PLANS; n: number }>("SELECT plan, COUNT(*) AS n FROM users GROUP BY plan");
  const mrr = plans.reduce((s, p) => s + (PLANS[p.plan]?.priceZar ?? 0) * p.n, 0);
  const totals = get<{ users: number; projects: number; designs: number; comments: number; quotes: number; requests: number }>(`SELECT
    (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM projects) AS projects, (SELECT COUNT(*) FROM designs) AS designs,
    (SELECT COUNT(*) FROM comments) AS comments, (SELECT COUNT(*) FROM quotes) AS quotes, (SELECT COUNT(*) FROM contractor_requests) AS requests`)!;
  const generationsThisMonth = get<{ n: number }>("SELECT COALESCE(SUM(generations), 0) AS n FROM usage WHERE month = ?", month)!.n;
  const signups = all<{ day: string; n: number }>("SELECT date(created_at) AS day, COUNT(*) AS n FROM users WHERE created_at >= date('now', '-29 days') GROUP BY day ORDER BY day");
  const styles = all<{ style: string; n: number }>("SELECT style, COUNT(*) AS n FROM designs GROUP BY style ORDER BY n DESC")
    .map((s) => ({ style: STYLES.find((x) => x.id === s.style)?.name ?? s.style, n: s.n }));
  const rooms = all<{ room: string; n: number }>("SELECT room_type AS room, COUNT(*) AS n FROM projects GROUP BY room_type ORDER BY n DESC");
  const accountTypes = all<{ type: string; n: number }>("SELECT account_type AS type, COUNT(*) AS n FROM users GROUP BY account_type ORDER BY n DESC");
  const basket = all<{ product_id: string; quantity: number; purchased: number }>("SELECT product_id, quantity, purchased FROM shopping_items");
  const basketValue = basket.reduce((s, b) => s + (PRODUCTS.find((p) => p.id === b.product_id)?.price ?? 0) * b.quantity, 0);
  const purchasedValue = basket.filter((b) => b.purchased).reduce((s, b) => s + (PRODUCTS.find((p) => p.id === b.product_id)?.price ?? 0) * b.quantity, 0);
  const commissionRate = 0.06;
  const recentUsers = all("SELECT name, email, plan, account_type AS accountType, created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 10");
  res.json({
    totals, mrr, arr: mrr * 12, generationsThisMonth, plans, signups, styles, rooms, accountTypes, recentUsers,
    marketplace: { basketValue, purchasedValue, commissionRate, estimatedCommission: Math.round(purchasedValue * commissionRate) },
  });
});
