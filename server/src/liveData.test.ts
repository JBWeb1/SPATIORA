import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { CURRENCIES, PRODUCTS } from "./data/catalog.js";
import { applyProductFeed, dataStatus, refreshCatalog, refreshExchangeRates } from "./services/liveData.js";

function serve(body: unknown, status = 200) {
  return new Promise<{ url: string; close: () => void }>((resolve) => {
    const srv = http.createServer((_req, res) => { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); }).listen(0, () => {
      const addr = srv.address() as { port: number };
      resolve({ url: `http://127.0.0.1:${addr.port}/feed`, close: () => srv.close() });
    });
  });
}

test("exchange rates refresh from a ZAR-based feed and ignore outliers", async () => {
  const usdBefore = CURRENCIES.USD.perZar;
  const s = await serve({ rates: { ZAR: 1, USD: usdBefore * 1.02, EUR: 999 } });
  await refreshExchangeRates(s.url);
  s.close();
  assert.equal(CURRENCIES.USD.perZar, Math.round(usdBefore * 1.02 * 1e6) / 1e6);
  assert.equal(CURRENCIES.EUR.perZar, 0.05, "absurd EUR rate is rejected");
  assert.equal(dataStatus().fx.ok, true);
});

test("exchange rates rebase a USD-based feed", async () => {
  const s = await serve({ rates: { USD: 1, ZAR: 18, GBP: 0.78 } });
  await refreshExchangeRates(s.url);
  s.close();
  assert.ok(Math.abs(CURRENCIES.GBP.perZar - 0.78 / 18) < 1e-6);
});

test("a failing feed keeps the last known rates", async () => {
  const before = CURRENCIES.GBP.perZar;
  const s = await serve({ error: "down" }, 503);
  await refreshExchangeRates(s.url);
  s.close();
  assert.equal(CURRENCIES.GBP.perZar, before);
  assert.equal(dataStatus().fx.ok, false);
});

test("product feed upserts, updates prices and removes discontinued items", async () => {
  const sofa = PRODUCTS.find((p) => p.id === "p-sofa-linen")!;
  const s = await serve({ products: [
    { id: "p-sofa-linen", price: 13500, leadTimeDays: 3 },
    { id: "p-new-lamp", name: "Arc floor lamp", category: "Lighting", subcategory: "Lamps", retailer: "Cape Home Co.", price: 2999, size: { w: 0.4, d: 0.4, h: 1.8 } },
    { id: "p-light-edison", discontinued: true },
    { id: "bad", price: -5 },
  ] });
  await refreshCatalog(s.url);
  s.close();
  assert.equal(PRODUCTS.find((p) => p.id === "p-sofa-linen")!.price, 13500);
  assert.equal(sofa.name, PRODUCTS.find((p) => p.id === "p-sofa-linen")!.name);
  assert.ok(PRODUCTS.some((p) => p.id === "p-new-lamp"));
  assert.ok(!PRODUCTS.some((p) => p.id === "p-light-edison"));
  assert.match(dataStatus().catalog.message, /\+1 new, 1 updated, 1 discontinued, 1 skipped/);
  assert.deepEqual(applyProductFeed([{ id: "nope", price: 10 }]), { added: 0, updated: 0, removed: 0, skipped: 1 });
});
