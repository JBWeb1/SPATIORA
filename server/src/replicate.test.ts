import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A fake Replicate API: model lookup -> prediction -> output image.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const seen: { path: string; body?: Record<string, unknown> }[] = [];
const srv = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    seen.push({ path: req.url!, body: raw ? JSON.parse(raw) : undefined });
    const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
    if (req.url === "/v1/models/adirik/interior-design") return res.end(JSON.stringify({ latest_version: { id: "ver-123" } }));
    if (req.url === "/v1/predictions") return res.end(JSON.stringify({ status: "processing", urls: { get: `${base}/v1/predictions/p1` } }));
    if (req.url === "/v1/predictions/p1") return res.end(JSON.stringify({ status: "succeeded", output: `${base}/out.png`, urls: { get: "" } }));
    if (req.url === "/out.png") { res.writeHead(200, { "Content-Type": "image/png" }); return res.end(PNG); }
    res.writeHead(404); res.end();
  });
});

test("photo-real redesigns call Replicate with the model's latest version", async () => {
  await new Promise<void>((r) => srv.listen(0, r));
  const port = (srv.address() as { port: number }).port;
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "vistora-rep-"));
  process.env.REPLICATE_API_TOKEN = "test-token";
  process.env.REPLICATE_API_BASE = `http://127.0.0.1:${port}/v1`;
  process.env.IMAGE_PROVIDER_URL = "";
  const { generateRedesign, activeImageProvider } = await import("./services/imageGen.js");
  assert.equal(activeImageProvider(), "replicate");
  const result = await generateRedesign({ roomType: "Living room", styleId: "japandi", preferences: { intensity: 0.6 }, source: { data: PNG, mime: "image/png" }, variant: 1 });
  srv.close();
  assert.equal(result.provider, "replicate");
  assert.match(result.imageUrl, /\.png$/);
  const create = seen.find((s) => s.path === "/v1/predictions")!;
  assert.equal(create.body!.version, "ver-123");
  const input = create.body!.input as Record<string, unknown>;
  assert.match(String(input.prompt), /japandi living room/i);
  assert.ok(Number(input.prompt_strength) >= 0.45 && Number(input.prompt_strength) <= 0.95);
  assert.equal(input.seed, 1000 + 7919);
});
