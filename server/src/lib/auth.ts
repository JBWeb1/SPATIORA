import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { get, parseJson } from "../db.js";
import { HttpError } from "./http.js";
import { PLANS, type PlanId } from "../data/catalog.js";

export interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  plan: PlanId;
  account_type: string;
  company: string | null;
  currency: string;
  province: string;
  style_profile: string | null;
  created_at: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRow;
    }
  }
}

export const signToken = (userId: string) => jwt.sign({ sub: userId }, config.jwtSecret, { expiresIn: "30d" });

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    plan: u.plan,
    planDetails: PLANS[u.plan] ?? PLANS.free,
    accountType: u.account_type,
    company: u.company,
    currency: u.currency,
    province: u.province,
    styleProfile: parseJson(u.style_profile, null),
    createdAt: u.created_at,
  };
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return next(new HttpError(401, "Please sign in"));
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    const user = get<UserRow>("SELECT * FROM users WHERE id = ?", payload.sub);
    if (!user) return next(new HttpError(401, "Account no longer exists"));
    req.user = user;
    next();
  } catch {
    next(new HttpError(401, "Session expired — please sign in again"));
  }
}

export const currentUser = (req: Request): UserRow => {
  if (!req.user) throw new HttpError(401, "Please sign in");
  return req.user;
};

export function requirePro(req: Request, _res: Response, next: NextFunction) {
  const u = currentUser(req);
  if (!PLANS[u.plan]?.workspace) return next(new HttpError(402, "The Professional Workspace is part of the Professional plan", "upgrade_required"));
  next();
}

/** Simple in-memory fixed-window rate limiter keyed by IP. */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    if (++entry.count > max) return next(new HttpError(429, "Too many requests — please slow down"));
    next();
  };
}
