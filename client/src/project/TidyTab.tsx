import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api";
import { BeforeAfter, fmtDate, Spinner } from "../components/ui";
import { useCatalog, useMoney, useToast } from "../state";
import type { Product, ShoppingItem } from "../types";
import type { TabProps } from "./context";

interface Hotspot { label: string; problem: string; fix: string; severity: "high" | "medium" | "low"; x: number | null; y: number | null }
interface TidyCheck {
  id: string;
  roomName: string;
  roomType: string;
  photo: string | null;
  provider: string;
  score: number | null;
  done: number[];
  render: string | null;
  renderProvider: string | null;
  createdAt: string;
  report: {
    summary: string;
    hotspots: Hotspot[];
    steps: { title: string; detail: string; minutes: number }[];
    zones: { name: string; purpose: string }[];
    storage: { need: string; productId: string; why: string; product: Product | null }[];
    layoutTips: string[];
    stylingTips: string[];
    habits: string[];
    sort: { keep: string[]; donate: string[]; recycle: string[] };
  };
}

const SELF_CHECK = [
  "The floor is clear, apart from furniture and rugs",
  "Flat surfaces (tables, counters, desk) are mostly clear",
  "Everything in view has a home it goes back to",
  "No laundry, dishes or rubbish lying around",
  "Cables and chargers are hidden or tidy",
  "I can find anything in this room within a minute",
];

const scoreLabel = (s: number) => (s >= 85 ? "Magazine-ready" : s >= 70 ? "Nicely organised" : s >= 50 ? "Lived-in" : s >= 30 ? "Getting cluttered" : "Needs a reset");
const scoreTone = (s: number) => (s >= 70 ? "good" : s >= 45 ? "warn" : "bad");

function ScoreRing({ score }: { score: number }) {
  const r = 42, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 100 100" width="104" height="104" role="img" aria-label={`Tidy score ${score} out of 100`}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="10" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={`var(--${scoreTone(score)})`} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${(c * score) / 100} ${c}`} transform="rotate(-90 50 50)" />
      <text x="50" y="50" textAnchor="middle" fontSize="26" fontWeight="700" fill="var(--ink)">{score}</text>
      <text x="50" y="67" textAnchor="middle" fontSize="10" fill="var(--ink-2)">/ 100</text>
    </svg>
  );
}

export default function TidyTab({ bundle, setBundle, goTo }: TabProps) {
  const p = bundle.project;
  const catalog = useCatalog();
  const money = useMoney();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [checks, setChecks] = useState<TidyCheck[] | null>(null);
  const [photoReal, setPhotoReal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "analyse" | "render">("");
  const [activeSpot, setActiveSpot] = useState<number | null>(null);
  const [selfCheck, setSelfCheck] = useState<boolean[]>(SELF_CHECK.map(() => false));
  const [showAfter, setShowAfter] = useState(true);

  const roomOptions = useMemo(() => {
    const rooms = p.house?.rooms.filter((r) => r.type !== "Whole home") ?? [];
    if (rooms.length) return rooms.map((r) => ({ key: r.id, name: r.name, type: r.type }));
    return catalog.roomTypes.filter((t) => t !== "Whole home").map((t) => ({ key: t, name: t, type: t }));
  }, [p.house, catalog.roomTypes]);
  const defaultRoom = roomOptions.find((r) => r.type === p.roomType) ?? roomOptions[0];
  const [roomKey, setRoomKey] = useState(defaultRoom?.key ?? "");
  const room = roomOptions.find((r) => r.key === roomKey) ?? defaultRoom;

  useEffect(() => {
    api.get<{ checks: TidyCheck[]; photoReal: boolean }>(`/projects/${p.id}/tidy`)
      .then((r) => { setChecks(r.checks); setPhotoReal(r.photoReal); setSelectedId(r.checks[0]?.id ?? null); })
      .catch((err) => { toast.error(err); setChecks([]); });
  }, [p.id, toast]);

  const check = checks?.find((c) => c.id === selectedId) ?? null;
  const replace = (c: TidyCheck) => setChecks((list) => (list ?? []).map((x) => (x.id === c.id ? c : x)));

  /** Previous check of the same room, to show progress. */
  const previous = useMemo(() => {
    if (!check || !checks) return null;
    const older = checks.filter((c) => c.roomName === check.roomName && c.createdAt < check.createdAt && c.score != null && c.id !== check.id);
    return older[0] ?? null;
  }, [check, checks]);

  const analyse = async (opts: { file?: File; useProjectPhoto?: boolean }) => {
    if (opts.file && !/^image\/(jpeg|png|webp)$/.test(opts.file.type)) return toast.error(new Error("Please use a JPG, PNG or WebP photo"));
    const fd = new FormData();
    if (opts.file) fd.append("photo", opts.file);
    if (opts.useProjectPhoto) fd.append("useProjectPhoto", "true");
    fd.append("roomName", room?.name ?? p.roomType);
    fd.append("roomType", room?.type ?? p.roomType);
    setBusy("analyse");
    try {
      const r = await api.post<{ check: TidyCheck }>(`/projects/${p.id}/tidy`, fd);
      setChecks((list) => [r.check, ...(list ?? [])]);
      setSelectedId(r.check.id);
      setSelfCheck(SELF_CHECK.map(() => false));
      setActiveSpot(null);
      toast.info(r.check.score != null ? `Tidy score: ${r.check.score}/100` : "Your tidy plan is ready");
    } catch (err) { toast.error(err); } finally { setBusy(""); }
  };

  const patch = async (c: TidyCheck, body: { done?: number[]; score?: number }) => {
    replace({ ...c, ...body });
    try { replace((await api.patch<{ check: TidyCheck }>(`/tidy/${c.id}`, body)).check); } catch (err) { toast.error(err); }
  };

  const toggleStep = (c: TidyCheck, i: number) => {
    const done = c.done.includes(i) ? c.done.filter((d) => d !== i) : [...c.done, i];
    patch(c, { done });
    if (done.length === c.report.steps.length && !c.done.includes(i)) toast.info("All steps done. Take a new photo to see your new score!");
  };

  const render = async (c: TidyCheck) => {
    setBusy("render");
    try {
      replace((await api.post<{ check: TidyCheck }>(`/tidy/${c.id}/render`)).check);
      setShowAfter(true);
    } catch (err) {
      toast.error(err);
      if (err instanceof ApiError && err.code === "upgrade_required") goTo("redesign");
    } finally { setBusy(""); }
  };

  const remove = async (c: TidyCheck) => {
    if (!confirm(`Delete the tidy check for ${c.roomName}?`)) return;
    await api.del(`/tidy/${c.id}`);
    setChecks((list) => {
      const next = (list ?? []).filter((x) => x.id !== c.id);
      setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };

  const addToList = async (productId: string) => {
    try {
      const r = await api.post<{ shopping: ShoppingItem[] }>(`/projects/${p.id}/shopping`, { productId, quantity: 1 });
      setBundle((b) => ({ ...b, shopping: r.shopping }));
      toast.info("Added to shopping list");
    } catch (err) { toast.error(err); }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) analyse({ file: f });
  };

  if (!checks) return <Spinner label="Loading tidy checks…" />;

  const stepsTotal = check ? check.report.steps.reduce((s, x) => s + x.minutes, 0) : 0;
  const stepsLeft = check ? check.report.steps.reduce((s, x, i) => s + (check.done.includes(i) ? 0 : x.minutes), 0) : 0;
  const progress = check && check.report.steps.length ? Math.round((check.done.length / check.report.steps.length) * 100) : 0;
  const renderIsPhoto = check?.render && check.renderProvider !== "studio-preview";

  return (
    <div className="tidy">
      <div className="card tidy-start">
        <div>
          <h3>🧹 Tidy &amp; organise</h3>
          <p className="muted small">Take a photo of any room. VISTORA scores how organised it looks, points out the clutter hotspots and gives you a step-by-step plan, storage that fits and styling tips to make it look its best, mostly using what you already have.</p>
        </div>
        <div className="row">
          <label className="small">Which room?{" "}
            <select value={room?.key} onChange={(e) => setRoomKey(e.target.value)} style={{ width: "auto" }}>
              {roomOptions.map((r) => <option key={r.key} value={r.key}>{r.name}{r.name !== r.type ? ` (${r.type})` : ""}</option>)}
            </select>
          </label>
          <button className="btn primary" disabled={!!busy} onClick={() => cameraRef.current?.click()}>📷 Take a photo</button>
          <button className="btn" disabled={!!busy} onClick={() => fileRef.current?.click()}>Upload photo</button>
          {p.sourceImage && <button className="btn ghost" disabled={!!busy} onClick={() => analyse({ useProjectPhoto: true })}>Use project photo</button>}
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onFile} />
        </div>
        {busy === "analyse" && <Spinner label="Looking around your room…" />}
      </div>

      {!check && busy !== "analyse" && (
        <div className="card flat muted tidy-empty">
          <div style={{ fontSize: 40 }}>📸</div>
          <p>No tidy checks yet. Snap the room as it is right now; mess is welcome!</p>
          <p className="small">Tip: stand in a doorway or corner and get as much of the room in as you can.</p>
        </div>
      )}

      {check && (
        <div className="tidy-layout">
          <div className="tidy-main">
            <div className="card">
              <div className="tidy-photo">
                {check.render && showAfter && renderIsPhoto && check.photo ? (
                  <BeforeAfter before={check.photo} after={check.render} beforeLabel="Now" afterLabel="Tidied" />
                ) : check.render && showAfter ? (
                  <img src={check.render} alt={`Tidy plan for ${check.roomName}`} />
                ) : check.photo ? (
                  <>
                    <img src={check.photo} alt={`${check.roomName} as it is now`} />
                    {check.report.hotspots.map((h, i) => h.x != null && h.y != null && (
                      <button key={i} className={`tidy-pin ${h.severity}${activeSpot === i ? " on" : ""}`} style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}
                        onClick={() => setActiveSpot(activeSpot === i ? null : i)} aria-label={`Hotspot ${i + 1}: ${h.label}`}>{i + 1}</button>
                    ))}
                  </>
                ) : null}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn accent" disabled={!!busy || !check.photo} onClick={() => render(check)}>
                  {photoReal ? "✨ Show it tidied (AI photo)" : "🗺 Make a tidy plan image"}
                </button>
                {check.render && <button className="btn sm" onClick={() => setShowAfter(!showAfter)}>{showAfter ? "Show hotspots" : "Show result"}</button>}
                {check.render && <a className="btn sm ghost" href={check.render} download>Download</a>}
                {busy === "render" && <Spinner label={photoReal ? "Tidying up your photo…" : "Drawing your plan…"} />}
              </div>
              {!photoReal && <p className="tiny muted" style={{ marginTop: 6 }}>Photo-real "after" images turn on when an image AI (Replicate) is connected. The tidy plan image marks each fix on your photo.</p>}
            </div>

            <div className="card">
              <h3>Clutter hotspots</h3>
              <ol className="tidy-spots">
                {check.report.hotspots.map((h, i) => (
                  <li key={i} className={activeSpot === i ? "on" : ""} onMouseEnter={() => setActiveSpot(i)} onMouseLeave={() => setActiveSpot(null)}>
                    <span className={`chip ${h.severity === "high" ? "bad" : h.severity === "medium" ? "warn" : "good"}`}>{h.severity}</span>{" "}
                    <b>{h.label}:</b> {h.problem}
                    <div className="small">→ {h.fix}</div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="card">
              <div className="row between">
                <h3>Your tidy plan</h3>
                <span className="small muted">{check.done.length}/{check.report.steps.length} done · {stepsLeft} of {stepsTotal} min left</span>
              </div>
              <div className="tidy-progress" aria-label={`${progress}% done`}><span style={{ width: `${progress}%` }} /></div>
              <ul className="tidy-steps">
                {check.report.steps.map((s, i) => (
                  <li key={i} className={check.done.includes(i) ? "done" : ""}>
                    <label>
                      <input type="checkbox" checked={check.done.includes(i)} onChange={() => toggleStep(check, i)} />
                      <span><b>{s.title}</b> <span className="chip">{s.minutes} min</span><br /><span className="small muted">{s.detail}</span></span>
                    </label>
                  </li>
                ))}
              </ul>
              {progress === 100 && (
                <div className="tidy-done">
                  🎉 Plan complete! Take a new photo of the {check.roomName.toLowerCase()} to see how much your score went up.
                  <button className="btn sm primary" onClick={() => { setRoomKey(roomOptions.find((r) => r.name === check.roomName)?.key ?? roomKey); cameraRef.current?.click(); }}>📷 Re-check</button>
                </div>
              )}
            </div>

            <div className="grid tidy-tips">
              <div className="card">
                <h3>✨ Make it look better</h3>
                <ul className="small">{check.report.stylingTips.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
              <div className="card">
                <h3>↔ Better layout</h3>
                <ul className="small">{check.report.layoutTips.map((t, i) => <li key={i}>{t}</li>)}</ul>
                <button className="btn sm" onClick={() => goTo(p.house?.rooms.length ? "house" : "studio")}>Try it in 3D</button>
              </div>
              <div className="card">
                <h3>▦ Storage zones</h3>
                <ul className="small">{check.report.zones.map((z, i) => <li key={i}><b>{z.name}:</b> {z.purpose}</li>)}</ul>
              </div>
              <div className="card">
                <h3>↻ Keep it this way</h3>
                <ul className="small">{check.report.habits.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </div>
            </div>

            <div className="card">
              <h3>Keep, donate or recycle</h3>
              <div className="grid cols-3 small">
                <div><b className="good-text">Keep</b><ul>{check.report.sort.keep.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
                <div><b>Donate</b><ul>{check.report.sort.donate.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
                <div><b>Recycle</b><ul>{check.report.sort.recycle.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
              </div>
            </div>

            {check.report.storage.length > 0 && (
              <div className="card">
                <h3>Storage that would help</h3>
                <p className="small muted">Only buy these after decluttering; you may need less than you think.</p>
                <div className="grid cols-3">
                  {check.report.storage.filter((s) => s.product).map((s) => {
                    const inList = bundle.shopping.some((x) => x.product.id === s.productId);
                    return (
                      <div key={s.productId} className="card flat tight">
                        <div className="tidy-swatch" style={{ background: s.product!.color }} />
                        <b className="small">{s.product!.name}</b>
                        <div className="tiny muted">{s.product!.retailer} · {money.format(s.product!.price)}</div>
                        <p className="small"><b>{s.need}.</b> {s.why}</p>
                        <button className="btn sm block" disabled={inList} onClick={() => addToList(s.productId)}>{inList ? "✓ On shopping list" : "+ Shopping list"}</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <aside className="tidy-side">
            <div className="card">
              <div className="small muted">{check.roomName} · {fmtDate(check.createdAt, true)}</div>
              {check.score != null ? (
                <div className="row" style={{ gap: 14, marginTop: 6 }}>
                  <ScoreRing score={check.score} />
                  <div>
                    <b>{scoreLabel(check.score)}</b>
                    {previous && previous.score != null && (
                      <div className={`small ${check.score >= previous.score ? "good-text" : "bad-text"}`}>
                        {check.score >= previous.score ? "▲" : "▼"} {Math.abs(check.score - previous.score)} since {fmtDate(previous.createdAt)}
                      </div>
                    )}
                    <div className="tiny muted">{check.provider === "claude" ? "Scored by AI from your photo" : "Self-rated"}</div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <b className="small">Rate the room to get your tidy score</b>
                  {SELF_CHECK.map((q, i) => (
                    <label key={i} className="row small" style={{ gap: 8, alignItems: "flex-start", margin: "6px 0" }}>
                      <input type="checkbox" checked={selfCheck[i]} onChange={() => setSelfCheck(selfCheck.map((v, j) => (j === i ? !v : v)))} style={{ width: "auto" }} />
                      <span>{q}</span>
                    </label>
                  ))}
                  <button className="btn sm primary" onClick={() => patch(check, { score: Math.round(20 + (selfCheck.filter(Boolean).length / SELF_CHECK.length) * 80) })}>Get my score</button>
                </div>
              )}
              <p className="small" style={{ marginTop: 10 }}>{check.report.summary}</p>
            </div>

            <div className="card">
              <h3>History</h3>
              <ul className="tidy-history">
                {checks.map((c) => (
                  <li key={c.id} className={c.id === check.id ? "on" : ""}>
                    <button className="linkish" onClick={() => { setSelectedId(c.id); setActiveSpot(null); setSelfCheck(SELF_CHECK.map(() => false)); }}>
                      {c.photo && <img src={c.render && c.renderProvider !== "studio-preview" ? c.render : c.photo} alt="" />}
                      <span><b className="small">{c.roomName}</b><br /><span className="tiny muted">{fmtDate(c.createdAt)}</span></span>
                      {c.score != null && <span className={`chip ${scoreTone(c.score)}`}>{c.score}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <button className="btn sm ghost danger" onClick={() => remove(check)}>Delete this check</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
