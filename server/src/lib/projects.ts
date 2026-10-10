import type { Request } from "express";
import { all, get, parseJson, run } from "../db.js";
import { PRODUCTS } from "../data/catalog.js";
import { currentUser } from "./auth.js";
import { notFound } from "./http.js";
import type { ProjectContext } from "../services/assistant.js";

export interface ProjectRow {
  id: string;
  user_id: string;
  client_id: string | null;
  name: string;
  room_type: string;
  description: string | null;
  status: string;
  budget: number;
  currency: string;
  source_image: string | null;
  cover_image: string | null;
  room: string;
  layout: string;
  finishes: string;
  moodboard: string;
  tags: string;
  share_token: string | null;
  created_at: string;
  updated_at: string;
}

export interface DesignRow {
  id: string;
  project_id: string;
  style: string;
  prompt: string;
  preferences: string;
  source_image: string | null;
  result_image: string;
  provider: string;
  favorite: number;
  notes: string | null;
  created_at: string;
}

export const DEFAULT_ROOM = { length: 5, width: 4, height: 2.7, doors: 1, windows: 2 };

export function serializeProject(p: ProjectRow) {
  return {
    id: p.id,
    clientId: p.client_id,
    name: p.name,
    roomType: p.room_type,
    description: p.description,
    status: p.status,
    budget: p.budget,
    currency: p.currency,
    sourceImage: p.source_image,
    coverImage: p.cover_image ?? p.source_image,
    room: { ...DEFAULT_ROOM, ...parseJson(p.room, {}) },
    layout: parseJson<unknown[]>(p.layout, []),
    finishes: parseJson<Record<string, unknown>>(p.finishes, {}),
    moodboard: parseJson<unknown[]>(p.moodboard, []),
    tags: parseJson<string[]>(p.tags, []),
    shareToken: p.share_token,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

export function serializeDesign(d: DesignRow) {
  return {
    id: d.id,
    projectId: d.project_id,
    style: d.style,
    prompt: d.prompt,
    preferences: parseJson(d.preferences, {}),
    sourceImage: d.source_image,
    resultImage: d.result_image,
    provider: d.provider,
    favorite: !!d.favorite,
    notes: d.notes,
    createdAt: d.created_at,
  };
}

export function ownedProject(req: Request, id: string): ProjectRow {
  const user = currentUser(req);
  const p = get<ProjectRow>("SELECT * FROM projects WHERE id = ? AND user_id = ?", id, user.id);
  if (!p) throw notFound("Project");
  return p;
}

export function shoppingList(projectId: string) {
  return all<{ id: string; product_id: string; quantity: number; purchased: number }>(
    "SELECT id, product_id, quantity, purchased FROM shopping_items WHERE project_id = ? ORDER BY created_at",
    projectId,
  ).map((s) => ({ id: s.id, quantity: s.quantity, purchased: !!s.purchased, product: PRODUCTS.find((p) => p.id === s.product_id) ?? null }))
    .filter((s) => s.product);
}

export function projectContext(p: ProjectRow, province: string): ProjectContext {
  const sp = serializeProject(p);
  const favorite = get<{ style: string }>("SELECT style FROM designs WHERE project_id = ? ORDER BY favorite DESC, created_at DESC LIMIT 1", p.id);
  return {
    name: sp.name,
    roomType: sp.roomType,
    budget: sp.budget,
    currency: sp.currency,
    room: sp.room,
    stylePreference: (sp.finishes.style as string | undefined) ?? favorite?.style,
    finishes: sp.finishes,
    province,
  };
}

export const touch = (projectId: string) => run("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", projectId);
