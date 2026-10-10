import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vistora-test-"));
process.env.DATA_DIR = tmp;
process.env.ANTHROPIC_API_KEY = "";
process.env.ANTHROPIC_AUTH_TOKEN = "";
process.env.IMAGE_PROVIDER_URL = "";
process.env.REPLICATE_API_TOKEN = "";

let server: Server;
let base = "";
let token = "";

// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function api(method: string, url: string, body?: unknown, auth = true) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(auth && token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  const { createApp } = await import("./app.js");
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});

after(() => {
  server?.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("full homeowner flow", async () => {
  const reg = await api("POST", "/api/auth/register", { name: "Thandi M", email: "thandi@example.com", password: "supersecret1" });
  assert.equal(reg.status, 201);
  token = reg.body.token;

  const dup = await api("POST", "/api/auth/register", { name: "Thandi M", email: "thandi@example.com", password: "supersecret1" });
  assert.equal(dup.status, 409);

  const catalog = await api("GET", "/api/catalog");
  assert.ok(catalog.body.styles.length >= 8);

  const created = await api("POST", "/api/projects", { name: "Lounge refresh", roomType: "Living room", budget: 80000, room: { length: 6, width: 4.5 } });
  assert.equal(created.status, 201);
  const id = created.body.project.id;

  const form = new FormData();
  form.append("photo", new Blob([PNG], { type: "image/png" }), "room.png");
  const photo = await api("POST", `/api/projects/${id}/photo`, form);
  assert.equal(photo.status, 200);
  assert.match(photo.body.project.sourceImage, /^\/uploads\/.+\.png$/);

  const bad = new FormData();
  bad.append("photo", new Blob([Buffer.from("<svg onload=alert(1)>")], { type: "image/png" }), "x.png");
  assert.equal((await api("POST", `/api/projects/${id}/photo`, bad)).status, 415);

  const gen = await api("POST", `/api/projects/${id}/designs`, { styleId: "japandi", variants: 2, preferences: { colors: ["#223344", "#ddccbb"] } });
  assert.equal(gen.status, 201);
  assert.equal(gen.body.designs.length, 2);
  assert.equal(gen.body.designs[0].provider, "studio-preview");
  const svg = await fetch(base + gen.body.designs[0].resultImage);
  assert.equal(svg.headers.get("content-type"), "image/svg+xml");
  assert.match(svg.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  assert.match(await svg.text(), /data:image\/png;base64/);

  // Free plan: 5 generations per month.
  const over = await api("POST", `/api/projects/${id}/designs`, { styleId: "coastal", variants: 4 });
  assert.equal(over.status, 402);

  await api("PATCH", `/api/projects/${id}`, { finishes: { style: "japandi", flooring: "floor-oak", wall: "wall-sage", ceiling: "ceiling-white" } });
  const est = await api("POST", `/api/projects/${id}/estimate`, { quality: "standard", electricalPoints: 2 });
  assert.equal(est.status, 200);
  assert.equal(est.body.estimate.geometry.floorArea, 27);
  assert.ok(est.body.estimate.totals.vat > 0);

  const shop = await api("POST", `/api/projects/${id}/shopping`, { productId: "p-sofa-linen", quantity: 1 });
  assert.equal(shop.body.shopping.length, 1);

  const tasks = await api("POST", `/api/projects/${id}/tasks/generate`, { startDate: "2026-11-02" });
  assert.ok(tasks.body.tasks.length > 5);

  const chat = await api("POST", `/api/projects/${id}/assistant`, { message: "What colour palette should I use?" });
  assert.equal(chat.body.provider, "vistora-advisor");
  assert.match(chat.body.reply, /Palette/);

  const energy = await api("POST", "/api/energy/plan", { province: "Gauteng", appliances: catalog.body.defaultAppliances, loadsheddingHours: 4, tariff: 3.5, wantSolar: true });
  assert.ok(energy.body.plan.system.inverterKva >= 3);

  const share = await api("POST", `/api/projects/${id}/share`, { enabled: true });
  const pub = await api("GET", `/api/share/${share.body.shareToken}`, undefined, false);
  assert.equal(pub.body.project.name, "Lounge refresh");
  assert.equal(pub.body.project.shareToken, undefined);
  const c = await api("POST", `/api/share/${share.body.shareToken}/comments`, { authorName: "Mom", body: "Love the green!", reaction: "love" }, false);
  assert.equal(c.status, 201);

  // Workspace is Pro-only.
  assert.equal((await api("GET", "/api/clients")).status, 402);
  await api("POST", "/api/auth/me/plan", { plan: "pro" });
  const client = await api("POST", "/api/clients", { name: "Acme Developers", email: "pm@acme.test" });
  assert.equal(client.status, 201);
  const quote = await api("POST", `/api/quotes/from-project/${id}`);
  assert.equal(quote.status, 201);
  assert.ok(quote.body.quote.totals.total > quote.body.quote.totals.subtotal);
});

test("isolates users from each other's projects", async () => {
  const other = await api("POST", "/api/auth/register", { name: "Sipho K", email: "sipho@example.com", password: "anothersecret" });
  const mine = await api("GET", "/api/projects");
  token = other.body.token;
  const theirs = await api("GET", "/api/projects");
  assert.equal(theirs.body.projects.length, 0);
  const sneaky = await api("GET", `/api/projects/${mine.body.projects[0].id}`);
  assert.equal(sneaky.status, 404);
});
