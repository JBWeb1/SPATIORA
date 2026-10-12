import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { fmtDate, Logo } from "../components/ui";
import { useAuth, useCatalog, useMoney } from "../state";
import type { Estimate, MoodItem } from "../types";
import type { ProjectBundle } from "../project/context";
import PlanView from "../project/PlanView";
import { floorArea, openings } from "../../../server/src/shared/house";

/** A client-ready presentation board for a project — print it or save as PDF. */
export default function Present() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const catalog = useCatalog();
  const money = useMoney();
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [est, setEst] = useState<{ estimate: Estimate; furnitureTotal: number; grandTotal: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<ProjectBundle>(`/projects/${id}`).then(setBundle).catch((e) => setError(e.message));
    api.post<{ estimate: Estimate; furnitureTotal: number; grandTotal: number }>(`/projects/${id}/estimate`, {}).then(setEst).catch(() => {});
  }, [id]);

  if (error) return <div className="container section"><div className="empty">{error}</div></div>;
  if (!bundle) return <div className="container section muted">Preparing presentation…</div>;
  const p = bundle.project;
  const styleOf = (sid?: unknown) => catalog.styles.find((s) => s.id === sid);
  const style = styleOf(p.finishes.style);
  const concepts = [...bundle.designs].sort((a, b) => Number(b.favorite) - Number(a.favorite)).slice(0, 4);
  const cover = p.coverImage ?? concepts[0]?.resultImage ?? p.sourceImage;
  const finishes = (["flooring", "wall", "ceiling", "tiles", "countertop", "cabinetry"] as const)
    .map((k) => ({ k, m: catalog.materials.find((m) => m.id === p.finishes[k]) })).filter((x) => x.m);

  return (
    <div className="present">
      <div className="row between no-print" style={{ marginBottom: 16 }}>
        <Link to={`/projects/${id}`} className="btn sm">← Back to project</Link>
        <div className="row"><span className="tiny">Tip: choose "Save as PDF" in the print dialog</span><button className="btn primary sm" onClick={() => window.print()}>Print / save PDF</button></div>
      </div>

      <section className="cover">
        {cover && <img className="bg" src={cover} alt="" />}
        <div className="row" style={{ marginBottom: "auto" }}><Logo size={40} /><b style={{ letterSpacing: ".18em" }}>VISTORA</b></div>
        <span className="chip" style={{ alignSelf: "start", background: "rgba(0,0,0,.45)", color: "#fff" }}>{p.roomType}{style ? ` · ${style.name}` : ""}</span>
        <h1 style={{ fontSize: 52, margin: "10px 0 4px", color: "#fff" }}>{p.name}</h1>
        <p style={{ margin: 0, opacity: .9 }}>Prepared by {user?.company ?? user?.name} · {fmtDate(new Date().toISOString())}</p>
      </section>

      {style && (
        <section>
          <h2>Design direction: {style.name}</h2>
          <p className="muted" style={{ fontSize: 17 }}>{style.tagline}</p>
          <div className="row" style={{ gap: 0, height: 60, borderRadius: 12, overflow: "hidden" }}>{style.palette.map((c) => <span key={c} style={{ flex: 1, height: "100%", background: c }} />)}</div>
          <div className="grid cols-2" style={{ marginTop: 14 }}>
            <div><h3>Signature elements</h3><ul className="small">{style.keywords.map((k) => <li key={k}>{k}</li>)}</ul></div>
            <div><h3>Materials</h3><ul className="small">{style.materials.map((k) => <li key={k}>{k}</li>)}</ul></div>
          </div>
        </section>
      )}

      {p.house && p.house.rooms.length > 0 && (
        <section>
          <h2>Floor plan</h2>
          <p className="muted">{p.house.rooms.length} spaces · {floorArea(p.house.rooms).toFixed(0)} m² under roof</p>
          <PlanView rooms={p.house.rooms} ops={openings(p.house.rooms)} items={p.house.items} />
        </section>
      )}

      {concepts.length > 0 && (
        <section>
          <h2>Concepts</h2>
          <div className="grid cols-2">
            {concepts.map((d) => (
              <figure key={d.id} style={{ margin: 0 }}>
                <img src={d.resultImage} alt="" style={{ borderRadius: 12, width: "100%" }} />
                <figcaption className="small" style={{ marginTop: 6 }}><b>{styleOf(d.style)?.name}</b>{d.favorite ? " · ♥ preferred" : ""}{d.notes ? ` — ${d.notes}` : ""}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {finishes.length > 0 && (
        <section>
          <h2>Finishes schedule</h2>
          <div className="grid cols-3">
            {finishes.map(({ k, m }) => (
              <div key={k} className="row" style={{ flexWrap: "nowrap" }}>
                <span className="swatch" style={{ background: m!.color, width: 54, height: 54, borderRadius: 10 }} />
                <div><div className="tiny" style={{ textTransform: "capitalize" }}>{k}</div><b className="small">{m!.name}</b></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {p.moodboard.length > 0 && (
        <section>
          <h2>Mood board</h2>
          <div className="moodboard">{(p.moodboard as MoodItem[]).map((m) => (
            <div key={m.id} className="mood">
              {m.kind === "image" ? <img src={m.value} alt="" /> : m.kind === "note" ? <div style={{ padding: 14, background: "var(--accent-soft)" }}>{m.value}</div> : <div style={{ height: 80, background: m.value }} />}
              {m.label && <div className="tiny" style={{ padding: "6px 8px" }}>{m.label}</div>}
            </div>
          ))}</div>
        </section>
      )}

      {(est || bundle.shopping.length > 0) && (
        <section>
          <h2>Investment summary</h2>
          {est && (
            <table className="table">
              <tbody>
                <tr><td>Renovation works (materials, labour, services, contingency)</td><td className="num">{money.format(est.estimate.totals.total - est.estimate.totals.vat)}</td></tr>
                <tr><td>Furniture, fixtures & products</td><td className="num">{money.format(est.furnitureTotal)}</td></tr>
                <tr><td>VAT on works</td><td className="num">{money.format(est.estimate.totals.vat)}</td></tr>
              </tbody>
              <tfoot><tr><td>Total investment</td><td className="num">{money.format(est.grandTotal)}</td></tr></tfoot>
            </table>
          )}
          {bundle.shopping.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Selected products</h3>
              <table className="table"><tbody>{bundle.shopping.map((s) => <tr key={s.id}><td>{s.product.name}<div className="tiny">{s.product.retailer}</div></td><td className="num">× {s.quantity}</td><td className="num">{money.format(s.product.price * s.quantity)}</td></tr>)}</tbody></table>
            </>
          )}
          <p className="tiny" style={{ marginTop: 12 }}>Figures are estimates for planning and subject to site measurement and final contractor quotations.</p>
        </section>
      )}
    </div>
  );
}
