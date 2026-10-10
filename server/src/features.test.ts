import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vistora-feat-"));
process.env.DATA_DIR = tmp;
process.env.VISTORA_DB = path.join(tmp, "feat.db");
process.env.ANTHROPIC_API_KEY = "";
process.env.ADMIN_EMAILS = "owner@vistora.test";

let server: Server;
let base = "";
async function call(token: string | null, method: string, url: string, body?: unknown) {
  const res = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  const { createApp } = await import("./app.js");
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test("notifications, watchlist price drops, optimiser, layout versions and admin", async () => {
  const owner = (await call(null, "POST", "/api/auth/register", { name: "Owner", email: "owner@vistora.test", password: "password123" })).body;
  const user = (await call(null, "POST", "/api/auth/register", { name: "Ayanda", email: "ayanda@example.com", password: "password123" })).body;
  assert.equal(owner.user.isAdmin, true);
  assert.equal(user.user.isAdmin, false);
  const t = user.token;

  // Share comment -> owner notification
  const p = (await call(t, "POST", "/api/projects", { name: "Kitchen", roomType: "Kitchen", budget: 60000 })).body.project;
  const share = (await call(t, "POST", `/api/projects/${p.id}/share`, { enabled: true })).body.shareToken;
  await call(null, "POST", `/api/share/${share}/comments`, { authorName: "Sis Thandeka", body: "Go for the sage cabinets!" });
  let inbox = (await call(t, "GET", "/api/notifications")).body;
  assert.equal(inbox.unread, 1);
  assert.match(inbox.notifications[0].title, /Sis Thandeka commented on Kitchen/);
  await call(t, "POST", "/api/notifications/read", {});
  assert.equal((await call(t, "GET", "/api/notifications")).body.unread, 0);

  // Watchlist + price drop alert
  const watched = (await call(t, "POST", "/api/watchlist", { productId: "p-app-oven" })).body;
  assert.equal(watched.items.length, 1);
  const { PRODUCTS } = await import("./data/catalog.js");
  const { checkPriceDrops } = await import("./services/notifications.js");
  const oven = PRODUCTS.find((x) => x.id === "p-app-oven")!;
  oven.price = Math.round(oven.price * 0.9);
  assert.equal(checkPriceDrops(), 1);
  assert.equal(checkPriceDrops(), 0, "no duplicate alert for the same price");
  inbox = (await call(t, "GET", "/api/notifications")).body;
  assert.match(inbox.notifications[0].title, /Price drop: Built-in multifunction oven/);

  // Budget optimiser
  await call(t, "PATCH", `/api/projects/${p.id}`, { finishes: { style: "modern-luxury", flooring: "floor-terrazzo", countertop: "counter-marble", countertopLength: 4, wall: "wall-navy" } });
  const opt = (await call(t, "POST", `/api/projects/${p.id}/optimise`, { quality: "premium", contingency: 0.2 })).body;
  assert.ok(opt.suggestions.length >= 3);
  assert.ok(opt.suggestions.every((s: { saving: number }) => s.saving > 0));
  assert.ok(opt.bestCombination.saving > 0 && opt.bestCombination.total < opt.currentTotal);

  // Layout versions
  await call(t, "PATCH", `/api/projects/${p.id}`, { layout: [{ id: "a", name: "Island", color: "#eeeeee", x: 0, z: 0, rotation: 0, w: 2, d: 1, h: 0.9 }] });
  assert.equal((await call(t, "POST", `/api/projects/${p.id}/layout-versions`, { name: "With island" })).status, 201);
  const versions = (await call(t, "GET", `/api/projects/${p.id}/layout-versions`)).body.versions;
  assert.equal(versions[0].name, "With island");
  assert.equal(versions[0].layout[0].name, "Island");

  // Admin dashboard
  assert.equal((await call(t, "GET", "/api/admin/stats")).status, 403);
  const stats = (await call(owner.token, "GET", "/api/admin/stats")).body;
  assert.equal(stats.totals.users, 2);
  assert.equal(stats.totals.projects, 1);
  assert.equal(typeof stats.mrr, "number");
});
