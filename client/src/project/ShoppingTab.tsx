import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Stars } from "../components/ui";
import { useMoney, useToast } from "../state";
import type { Product, ShoppingItem } from "../types";
import type { TabProps } from "./context";

export default function ShoppingTab({ bundle, setBundle }: TabProps) {
  const money = useMoney();
  const toast = useToast();
  const [suggestions, setSuggestions] = useState<Product[]>([]);
  const style = bundle.project.finishes.style as string | undefined;

  useEffect(() => {
    api.get<{ products: Product[] }>(`/products?sort=rating${style ? `&style=${style}` : ""}`).then((r) => setSuggestions(r.products.slice(0, 8))).catch(() => {});
  }, [style]);

  const setList = (shopping: ShoppingItem[]) => setBundle((b) => ({ ...b, shopping }));
  const add = async (productId: string) => {
    try { setList((await api.post<{ shopping: ShoppingItem[] }>(`/projects/${bundle.project.id}/shopping`, { productId, quantity: 1 })).shopping); toast.info("Added to shopping list"); }
    catch (err) { toast.error(err); }
  };
  const patch = async (id: string, body: Record<string, unknown>) => {
    try { setList((await api.patch<{ shopping: ShoppingItem[] }>(`/shopping/${id}`, body)).shopping); } catch (err) { toast.error(err); }
  };
  const remove = async (id: string) => setList((await api.del<{ shopping: ShoppingItem[] }>(`/shopping/${id}`)).shopping);

  const byRetailer = useMemo(() => {
    const map = new Map<string, ShoppingItem[]>();
    for (const s of bundle.shopping) map.set(s.product.retailer, [...(map.get(s.product.retailer) ?? []), s]);
    return [...map.entries()];
  }, [bundle.shopping]);
  const total = bundle.shopping.reduce((s, i) => s + i.product.price * i.quantity, 0);
  const bought = bundle.shopping.filter((i) => i.purchased).reduce((s, i) => s + i.product.price * i.quantity, 0);
  const lead = Math.max(0, ...bundle.shopping.filter((i) => !i.purchased).map((i) => i.product.leadTimeDays));

  const exportCsv = () => {
    const rows = [["Product", "Retailer", "Qty", "Unit price (ZAR)", "Total (ZAR)", "Purchased"], ...bundle.shopping.map((s) => [s.product.name, s.product.retailer, s.quantity, s.product.price, s.product.price * s.quantity, s.purchased ? "yes" : "no"])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${bundle.project.name}-shopping-list.csv`;
    a.click();
  };

  return (
    <div className="split">
      <div className="stack">
        <div className="card stack">
          <div className="stat"><span className="tiny">List total (incl. VAT)</span><b>{money.format(total)}</b></div>
          <div className="small">Purchased: {money.format(bought)} · Remaining: {money.format(total - bought)}</div>
          {lead > 0 && <div className="small">Longest lead time: <b>{lead} days</b> — order early.</div>}
          <div className="row"><Link to={`/marketplace?project=${bundle.project.id}`} className="btn accent sm">Browse marketplace</Link><button className="btn sm" onClick={exportCsv} disabled={!bundle.shopping.length}>Export CSV</button></div>
        </div>
        <div className="card">
          <h3>Recommended for {style ? "this style" : "you"}</h3>
          <div className="stack" style={{ gap: 8 }}>
            {suggestions.map((p) => (
              <div key={p.id} className="row between small" style={{ gap: 8 }}>
                <span className="row" style={{ gap: 6 }}><span className="swatch" style={{ background: p.color, width: 18, height: 18 }} /> <span>{p.name}<div className="tiny">{money.format(p.price)} · {p.retailer}</div></span></span>
                <button className="btn sm" onClick={() => add(p.id)}>+</button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="stack">
        {byRetailer.length === 0 ? <div className="empty"><h3>Your shopping list is empty</h3><p>Add products from the marketplace or the recommendations.</p></div> : byRetailer.map(([retailer, items]) => (
          <div key={retailer} className="card">
            <div className="row between"><h3 style={{ margin: 0 }}>{retailer}</h3><span className="small">{money.format(items.reduce((s, i) => s + i.product.price * i.quantity, 0))}</span></div>
            <div className="table-wrap"><table className="table">
              <tbody>
                {items.map((s) => (
                  <tr key={s.id} style={{ opacity: s.purchased ? 0.55 : 1 }}>
                    <td style={{ width: 28 }}><input type="checkbox" checked={s.purchased} onChange={(e) => patch(s.id, { purchased: e.target.checked })} aria-label="Purchased" /></td>
                    <td>{s.product.name}<div className="tiny">{s.product.subcategory} · <Stars value={s.product.rating} /> {s.product.ecoRated && "· 🌿 eco"} {s.product.localMade && "· 🇿🇦 local"}</div></td>
                    <td style={{ width: 80 }}><input type="number" min={1} value={s.quantity} onChange={(e) => patch(s.id, { quantity: Math.max(1, Number(e.target.value)) })} /></td>
                    <td className="num">{money.format(s.product.price * s.quantity)}</td>
                    <td style={{ width: 40 }}><button className="btn ghost sm" onClick={() => remove(s.id)} aria-label="Remove">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        ))}
      </div>
    </div>
  );
}
