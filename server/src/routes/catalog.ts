import { Router } from "express";
import { CONTRACTORS, CURRENCIES, MATERIALS, PLANS, PRODUCTS, PROVINCES, ROOM_TYPES, STYLES, VAT_RATE } from "../data/catalog.js";
import { DEFAULT_APPLIANCES } from "../services/energy.js";
import { activeImageProvider } from "../services/imageGen.js";
import { config } from "../config.js";

export const catalogRouter = Router();

catalogRouter.get("/catalog", (_req, res) => {
  res.json({
    roomTypes: ROOM_TYPES,
    styles: STYLES,
    materials: MATERIALS,
    provinces: PROVINCES,
    currencies: CURRENCIES,
    plans: PLANS,
    vatRate: VAT_RATE,
    defaultAppliances: DEFAULT_APPLIANCES,
    capabilities: { imageProvider: activeImageProvider(), assistant: config.claude.enabled ? "claude" : "vistora-advisor" },
  });
});

catalogRouter.get("/products", (req, res) => {
  const q = String(req.query.q ?? "").toLowerCase().trim();
  const category = String(req.query.category ?? "");
  const style = String(req.query.style ?? "");
  const maxPrice = Number(req.query.maxPrice ?? 0);
  const eco = req.query.eco === "1";
  const local = req.query.local === "1";
  const sort = String(req.query.sort ?? "relevance");
  let items = PRODUCTS.filter((p) =>
    (!q || `${p.name} ${p.subcategory} ${p.retailer}`.toLowerCase().includes(q)) &&
    (!category || p.category === category) &&
    (!style || p.styles.includes(style)) &&
    (!maxPrice || p.price <= maxPrice) &&
    (!eco || p.ecoRated) &&
    (!local || p.localMade));
  if (sort === "price-asc") items = [...items].sort((a, b) => a.price - b.price);
  if (sort === "price-desc") items = [...items].sort((a, b) => b.price - a.price);
  if (sort === "rating") items = [...items].sort((a, b) => b.rating - a.rating);
  res.json({ products: items, categories: [...new Set(PRODUCTS.map((p) => p.category))] });
});

catalogRouter.get("/contractors", (req, res) => {
  const province = String(req.query.province ?? "");
  const trade = String(req.query.trade ?? "");
  const items = CONTRACTORS.filter((c) => (!province || c.provinces.includes(province)) && (!trade || c.trades.includes(trade)))
    .sort((a, b) => Number(b.verified) - Number(a.verified) || b.rating - a.rating);
  res.json({ contractors: items, trades: [...new Set(CONTRACTORS.flatMap((c) => c.trades))].sort() });
});
