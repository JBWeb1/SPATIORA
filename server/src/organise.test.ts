import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vistora-tidy-"));
process.env.DATA_DIR = tmp;
process.env.VISTORA_DB = path.join(tmp, "tidy.db");
process.env.ANTHROPIC_API_KEY = "";
process.env.REPLICATE_API_TOKEN = "";

// 2×2 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");

let server: Server;
let base = "";
let token = "";
const json = async (method: string, url: string, body?: unknown) => {
  const res = await fetch(base + url, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

before(async () => {
  const { createApp } = await import("./app.js");
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  token = (await json("POST", "/api/auth/register", { name: "Lerato", email: "lerato@example.com", password: "password123" })).body.token;
});
after(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test("tidy check from a photo: plan, organiser products, progress, self-score and tidy-plan render", async () => {
  const p = (await json("POST", "/api/projects", { name: "Our house", roomType: "Whole home", budget: 80000 })).body.project;

  const noPhoto = await json("POST", `/api/projects/${p.id}/tidy`, { roomName: "Lounge" });
  assert.equal(noPhoto.status, 400);

  const form = new FormData();
  form.append("photo", new Blob([PNG], { type: "image/png" }), "lounge.png");
  form.append("roomName", "Lounge");
  form.append("roomType", "Living room");
  const res = await fetch(`${base}/api/projects/${p.id}/tidy`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  assert.equal(res.status, 201);
  const { check } = (await res.json()) as { check: any };
  assert.equal(check.roomName, "Lounge");
  assert.equal(check.roomType, "Living room");
  assert.equal(check.provider, "vistora-advisor");
  assert.equal(check.score, null);
  assert.ok(check.report.steps.length >= 4);
  assert.ok(check.report.hotspots.length >= 3);
  assert.ok(check.report.storage.length >= 1);
  for (const s of check.report.storage) assert.ok(s.product?.price > 0, `${s.productId} resolves to a product`);

  const patched = (await json("PATCH", `/api/tidy/${check.id}`, { done: [2, 0, 2], score: 64 })).body.check;
  assert.deepEqual(patched.done, [0, 2]);
  assert.equal(patched.score, 64);

  const rendered = await json("POST", `/api/tidy/${check.id}/render`);
  assert.equal(rendered.status, 200);
  assert.equal(rendered.body.check.renderProvider, "studio-preview");
  const svg = fs.readFileSync(path.join(tmp, "uploads", path.basename(rendered.body.check.render)), "utf8");
  assert.match(svg, /TIDY PLAN · SCORE 64\/100/);

  // Re-using the project photo for a second check in another room
  const photoForm = new FormData();
  photoForm.append("photo", new Blob([PNG], { type: "image/png" }), "kitchen.png");
  await fetch(`${base}/api/projects/${p.id}/photo`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: photoForm });
  const second = await json("POST", `/api/projects/${p.id}/tidy`, { roomName: "Kitchen", roomType: "Kitchen", useProjectPhoto: "true" });
  assert.equal(second.status, 201);
  assert.ok(second.body.check.report.storage.some((s: { productId: string }) => s.productId === "p-org-pantry"));

  const list = (await json("GET", `/api/projects/${p.id}/tidy`)).body;
  assert.equal(list.checks.length, 2);
  assert.equal(list.photoReal, false);

  assert.equal((await json("DELETE", `/api/tidy/${check.id}`)).status, 204);
  assert.equal((await json("GET", `/api/projects/${p.id}/tidy`)).body.checks.length, 1);
});

test("model output is clamped to safe ranges", async () => {
  const { cleanReport, guideFor } = await import("./services/organise.js");
  const r = cleanReport({ ...guideFor("Bedroom"), score: 140, hotspots: [{ label: "a", problem: "b", fix: "c", severity: "high", x: 2, y: -1 }], storage: [{ need: "x", productId: "nope", why: "y" }] });
  assert.equal(r.score, 100);
  assert.deepEqual([r.hotspots[0].x, r.hotspots[0].y], [0.97, 0.03]);
  assert.equal(r.storage.length, 0);
});
