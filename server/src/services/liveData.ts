// Self-updating reference data: exchange rates and partner product feeds are
// refreshed on a schedule, so prices stay current without a redeploy.
import { z } from "zod";
import { CURRENCIES, PRODUCTS, type Product } from "../data/catalog.js";

interface FeedStatus {
  enabled: boolean;
  source: string | null;
  updatedAt: string | null;
  lastAttemptAt: string | null;
  ok: boolean;
  message: string;
}

const status: { fx: FeedStatus; catalog: FeedStatus & { products: number } } = {
  fx: { enabled: false, source: null, updatedAt: null, lastAttemptAt: null, ok: true, message: "Using built-in indicative rates" },
  catalog: { enabled: false, source: null, updatedAt: null, lastAttemptAt: null, ok: true, message: "Using built-in catalogue", products: PRODUCTS.length },
};

export const dataStatus = () => ({ fx: { ...status.fx }, catalog: { ...status.catalog, products: PRODUCTS.length } });

const now = () => new Date().toISOString();

async function fetchJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------- Exchange rates ----------------------------------------

const fxSchema = z.object({ rates: z.record(z.string(), z.number().positive()) });

export async function refreshExchangeRates(url: string) {
  status.fx.lastAttemptAt = now();
  try {
    const { rates } = fxSchema.parse(await fetchJson(url));
    // Rates must be quoted per 1 ZAR. Accept a ZAR-based feed directly, or rebase one that includes ZAR.
    const base = rates.ZAR && Math.abs(rates.ZAR - 1) > 1e-9 ? rates.ZAR : 1;
    let updated = 0;
    for (const code of Object.keys(CURRENCIES)) {
      if (code === "ZAR") continue;
      const r = rates[code];
      if (r && Number.isFinite(r)) {
        const perZar = r / base;
        // Guard against garbage: ignore moves of more than 50% from the current value.
        const current = CURRENCIES[code].perZar;
        if (perZar > current * 0.5 && perZar < current * 1.5) {
          CURRENCIES[code].perZar = Math.round(perZar * 1e6) / 1e6;
          updated++;
        }
      }
    }
    Object.assign(status.fx, { ok: true, updatedAt: now(), message: `Updated ${updated} currencies` });
  } catch (err) {
    Object.assign(status.fx, { ok: false, message: `Refresh failed (${(err as Error).message}); keeping last known rates` });
  }
}

// ---------------------------- Product feed ------------------------------------------

const productSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  category: z.enum(["Furniture", "Lighting", "Appliances", "Fixtures", "Decor", "Building materials", "Energy"]),
  subcategory: z.string().max(80),
  retailer: z.string().max(120),
  price: z.number().positive().max(10_000_000),
  styles: z.array(z.string()).max(20).default([]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#999999"),
  size: z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() }),
  rating: z.number().min(0).max(5).default(4),
  ecoRated: z.boolean().optional(),
  localMade: z.boolean().optional(),
  leadTimeDays: z.number().int().min(0).max(365).default(7),
  discontinued: z.boolean().optional(),
});
const priceUpdateSchema = z.object({ id: z.string(), price: z.number().positive().max(10_000_000).optional(), leadTimeDays: z.number().int().min(0).max(365).optional(), rating: z.number().min(0).max(5).optional(), discontinued: z.boolean().optional() });
const feedSchema = z.object({ products: z.array(z.unknown()).max(20_000) });

/** Merge a partner feed: full products are upserted, partial rows update price/stock fields. */
export function applyProductFeed(rows: unknown[]) {
  let added = 0, updated = 0, removed = 0, skipped = 0;
  for (const row of rows) {
    const full = productSchema.safeParse(row);
    const partial = full.success ? null : priceUpdateSchema.safeParse(row);
    const data = full.success ? full.data : partial?.success ? partial.data : null;
    if (!data) { skipped++; continue; }
    const idx = PRODUCTS.findIndex((p) => p.id === data.id);
    if (data.discontinued) {
      if (idx >= 0) { PRODUCTS.splice(idx, 1); removed++; }
      continue;
    }
    if (idx >= 0) {
      const { discontinued: _d, ...rest } = data as Partial<Product> & { discontinued?: boolean };
      PRODUCTS[idx] = { ...PRODUCTS[idx], ...rest };
      updated++;
    } else if (full.success) {
      const { discontinued: _d, ...product } = full.data;
      PRODUCTS.push(product as Product);
      added++;
    } else skipped++;
  }
  return { added, updated, removed, skipped };
}

type Listener = () => void;
const catalogListeners: Listener[] = [];
/** Run a callback whenever the product catalogue refreshes (e.g. price-drop alerts). */
export const onCatalogUpdated = (fn: Listener) => { catalogListeners.push(fn); };

export async function refreshCatalog(url: string) {
  status.catalog.lastAttemptAt = now();
  try {
    const { products } = feedSchema.parse(await fetchJson(url, 30_000));
    const r = applyProductFeed(products);
    Object.assign(status.catalog, { ok: true, updatedAt: now(), message: `+${r.added} new, ${r.updated} updated, ${r.removed} discontinued, ${r.skipped} skipped` });
    for (const fn of catalogListeners) { try { fn(); } catch (err) { console.error("[vistora] catalogue listener failed:", err); } }
  } catch (err) {
    Object.assign(status.catalog, { ok: false, message: `Refresh failed (${(err as Error).message}); keeping current catalogue` });
  }
}

// ---------------------------- Scheduler ---------------------------------------------

export function startLiveData(opts: { fxUrl: string; fxHours: number; catalogUrl: string; catalogHours: number }) {
  const timers: NodeJS.Timeout[] = [];
  const schedule = (fn: () => Promise<void>, hours: number) => {
    fn();
    const t = setInterval(fn, Math.max(0.25, hours) * 3_600_000);
    t.unref();
    timers.push(t);
  };
  if (opts.fxUrl && opts.fxUrl !== "off") {
    Object.assign(status.fx, { enabled: true, source: new URL(opts.fxUrl).host });
    schedule(() => refreshExchangeRates(opts.fxUrl), opts.fxHours);
  }
  if (opts.catalogUrl) {
    Object.assign(status.catalog, { enabled: true, source: new URL(opts.catalogUrl).host });
    schedule(() => refreshCatalog(opts.catalogUrl), opts.catalogHours);
  }
  return () => timers.forEach(clearInterval);
}
