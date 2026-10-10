import { all, newId, run } from "../db.js";
import { PRODUCTS } from "../data/catalog.js";

export type NotificationKind = "comment" | "price-drop" | "quote" | "contractor" | "system";

export function notify(userId: string, kind: NotificationKind, title: string, body?: string | null, link?: string | null) {
  run("INSERT INTO notifications (id, user_id, kind, title, body, link) VALUES (?, ?, ?, ?, ?, ?)", newId(), userId, kind, title.slice(0, 200), body?.slice(0, 500) ?? null, link ?? null);
  // Keep each inbox bounded.
  run(`DELETE FROM notifications WHERE user_id = ? AND id NOT IN (SELECT id FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 200)`, userId, userId);
}

/**
 * Called after the product catalogue refreshes: alert users whose watched products
 * have dropped at least 3% below the price they saw (once per new low price).
 */
export function checkPriceDrops(): number {
  const watches = all<{ user_id: string; product_id: string; price_at_add: number; last_alert_price: number | null }>(
    "SELECT user_id, product_id, price_at_add, last_alert_price FROM watchlist");
  let sent = 0;
  for (const w of watches) {
    const product = PRODUCTS.find((p) => p.id === w.product_id);
    if (!product) continue;
    const reference = w.last_alert_price ?? w.price_at_add;
    if (product.price <= reference * 0.97) {
      const pct = Math.round((1 - product.price / w.price_at_add) * 100);
      notify(w.user_id, "price-drop", `Price drop: ${product.name}`, `Now R${product.price.toLocaleString("en-ZA")} at ${product.retailer} — ${pct}% below when you saved it.`, `/marketplace?q=${encodeURIComponent(product.name)}`);
      run("UPDATE watchlist SET last_alert_price = ? WHERE user_id = ? AND product_id = ?", product.price, w.user_id, w.product_id);
      sent++;
    }
  }
  return sent;
}
