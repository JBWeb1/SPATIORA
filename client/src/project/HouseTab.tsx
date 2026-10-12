import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { uid } from "../components/ui";
import { useCatalog, useMoney, useToast } from "../state";
import type { House, HouseRoom, LayoutItem, Product } from "../types";
import { floorArea, houseBounds, openings, overlappingRooms } from "../../../server/src/shared/house";
import type { TabProps } from "./context";
import PlanView from "./PlanView";
import { autoFurnishHouse, checkHouse, roomAt } from "./layoutTools";
import { sendViewToAi } from "./sendToAi";

const HouseScene = lazy(() => import("./three/HouseScene"));

interface Template { id: string; name: string; location: string; description: string; bedrooms: number; bathrooms: number; area: number; budget: number; house: Omit<House, "items"> }

const DEFAULT_SIZE: Record<string, [number, number]> = {
  "Living room": [5, 4.5], Kitchen: [4, 3.5], Bathroom: [2.5, 2.5], Bedroom: [3.5, 3.5], "Dining room": [4, 3.5],
  "Home office": [3, 3], "Kids room": [3.2, 3], "Patio & outdoor": [4, 3], "Entrance & hallway": [4, 1.2],
};

type Item = LayoutItem & { roomId?: string };

export default function HouseTab({ bundle, setBundle, save, goTo }: TabProps) {
  const catalog = useCatalog();
  const money = useMoney();
  const toast = useToast();
  const p = bundle.project;
  const [house, setHouse] = useState<House>(p.house ?? { rooms: [], items: [], height: p.room.height || 2.7 });
  const [dirty, setDirty] = useState(false);
  const [view, setView] = useState<"split" | "plan" | "3d" | "walk">("split");
  const [walls, setWalls] = useState<"cutaway" | "full">("cutaway");
  const [editMode, setEditMode] = useState<"rooms" | "furniture">("rooms");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [itemId, setItemId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [category, setCategory] = useState("Furniture");
  const [estimate, setEstimate] = useState<{ total: number; rooms: { id: string; total: number }[] } | null>(null);
  const [sending, setSending] = useState(false);
  const capture = useRef<(() => string) | null>(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => {
    api.get<{ products: Product[] }>("/products").then((r) => setProducts(r.products)).catch(() => {});
    api.get<{ templates: Template[] }>("/house-templates").then((r) => setTemplates(r.templates)).catch(() => {});
  }, []);

  // Debounced save, then refresh the whole-house estimate.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => {
      saveRef.current({ house }).then(() => { setDirty(false); loadEstimate(); }).catch(() => {});
    }, 900);
    return () => clearTimeout(t);
  }, [house, dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadEstimate = () => api.post<{ estimate: { totals: { total: number }; rooms?: { id: string; total: number }[] } }>(`/projects/${p.id}/estimate`, {})
    .then((r) => setEstimate({ total: r.estimate.totals.total, rooms: r.estimate.rooms ?? [] })).catch(() => {});
  useEffect(() => { if (house.rooms.length) loadEstimate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ops = useMemo(() => openings(house.rooms), [house.rooms]);
  const issues = useMemo(() => checkHouse(house.rooms, ops, house.items, house.height), [house, ops]);
  const overlaps = useMemo(() => overlappingRooms(house.rooms), [house.rooms]);
  const room = house.rooms.find((r) => r.id === roomId) ?? null;
  const item = house.items.find((i) => i.id === itemId) ?? null;
  const update = (next: House) => { setHouse(next); setDirty(true); };

  const matColor = (id: string | null | undefined, fallback: string) => catalog.materials.find((m) => m.id === id)?.color ?? fallback;
  const mats = useMemo(() => ({
    floorColor: (r: HouseRoom) => { const id = (r.floor ?? (p.finishes.flooring as string)) || null; return { id, color: matColor(id, "#b9a58a") }; },
    wallColor: (r: HouseRoom) => { const id = (r.wall ?? (p.finishes.wall as string)) || null; return { id, color: matColor(id, "#efebe4") }; },
  }), [p.finishes, catalog.materials]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- rooms
  const patchRoom = (id: string, patch: Partial<HouseRoom>) => update({ ...house, rooms: house.rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const moveRoom = (id: string, x: number, z: number) => {
    const r = house.rooms.find((q) => q.id === id)!;
    const dx = x - r.x, dz = z - r.z;
    if (!dx && !dz) return;
    update({
      ...house,
      rooms: house.rooms.map((q) => (q.id === id ? { ...q, x, z } : q)),
      items: house.items.map((it) => ((roomAt(house.rooms, it.x, it.z)?.id ?? it.roomId) === id ? { ...it, x: it.x + dx, z: it.z + dz } : it)),
    });
  };
  const addRoom = (type: string) => {
    const [l, w] = DEFAULT_SIZE[type] ?? [3.5, 3.5];
    const b = houseBounds(house.rooms);
    const r: HouseRoom = { id: uid(), name: `${type === "Entrance & hallway" ? "Hallway" : type} ${house.rooms.filter((q) => q.type === type).length + 1}`, type, x: house.rooms.length ? b.maxX : 0, z: house.rooms.length ? b.minZ : 0, length: l, width: w };
    update({ ...house, rooms: [...house.rooms, r] });
    setRoomId(r.id);
    setEditMode("rooms");
  };
  const deleteRoom = (id: string) => {
    if (!confirm("Delete this room and its furniture?")) return;
    update({ ...house, rooms: house.rooms.filter((r) => r.id !== id), items: house.items.filter((it) => (roomAt(house.rooms, it.x, it.z)?.id ?? it.roomId) !== id) });
    setRoomId(null);
  };

  // ---- furniture
  const moveItem = (id: string, x: number, z: number) => {
    const b = houseBounds(house.rooms);
    const nx = Math.min(b.maxX, Math.max(b.minX, x)), nz = Math.min(b.maxZ, Math.max(b.minZ, z));
    update({ ...house, items: house.items.map((it) => (it.id === id ? { ...it, x: nx, z: nz, roomId: roomAt(house.rooms, nx, nz)?.id ?? it.roomId } : it)) });
  };
  const patchItem = (patch: Partial<Item>) => item && update({ ...house, items: house.items.map((it) => (it.id === item.id ? { ...it, ...patch } : it)) });
  const addItem = (base: Omit<LayoutItem, "id" | "x" | "z" | "rotation">) => {
    const target = room ?? house.rooms.find((r) => r.type !== "Patio & outdoor") ?? house.rooms[0];
    if (!target) return toast.error(new Error("Add a room first"));
    const it: Item = { ...base, id: uid(), x: target.x + target.length / 2, z: target.z + target.width / 2, rotation: 0, roomId: target.id };
    update({ ...house, items: [...house.items, it] });
    setItemId(it.id);
    setEditMode("furniture");
  };
  const furnish = () => {
    if (house.items.length && !confirm("Replace all furniture with an auto-furnished layout for every room?")) return;
    const items = autoFurnishHouse(house.rooms, ops, house.height, products);
    update({ ...house, items });
    toast.info(`Furnished ${house.rooms.length} rooms with ${items.length} pieces`);
  };

  const applyTemplate = async (t: Template) => {
    const rooms = t.house.rooms.map((r) => ({ ...r }));
    const items = autoFurnishHouse(rooms, openings(rooms), t.house.height, products);
    const next = { rooms, height: t.house.height, items };
    setHouse(next);
    await save({ house: next, roomType: "Whole home" });
    loadEstimate();
    toast.info(`${t.name} loaded and furnished`);
  };

  const send = async () => {
    setSending(true);
    try {
      const project = await sendViewToAi(p.id, capture.current);
      setBundle((b) => ({ ...b, project }));
      toast.info("View sent — now pick a style and press Redesign to get a photo-real render");
      goTo("redesign");
    } catch (err) { toast.error(err); } finally { setSending(false); }
  };

  // ---- empty state
  if (!house.rooms.length) {
    return (
      <div className="stack">
        <div className="card">
          <h3>Design the whole house</h3>
          <p className="muted small">Lay out every room on one floor plan — walls, doors and windows are created for you — then furnish it, walk through it in 3D and cost the whole renovation.</p>
          <div className="row">
            {["Living room", "Kitchen", "Bedroom", "Bathroom", "Entrance & hallway"].map((t) => <button key={t} className="btn sm" onClick={() => addRoom(t)}>+ {t}</button>)}
          </div>
        </div>
        <h3>…or start from a real sample home</h3>
        <div className="grid cols-2">
          {templates.map((t) => (
            <div key={t.id} className="card stack">
              <PlanView rooms={t.house.rooms} ops={openings(t.house.rooms)} compact />
              <div className="row between"><b>{t.name}</b><span className="tiny">{t.location}</span></div>
              <span className="small muted">{t.bedrooms} bed · {t.bathrooms} bath · {t.area} m² · typical refresh {money.format(t.budget)}</span>
              <button className="btn primary sm" onClick={() => applyTemplate(t)}>Use this home</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const b = houseBounds(house.rooms);
  const show3d = view !== "plan";
  const showPlan = view === "plan" || view === "split";

  return (
    <div className="studio">
      <div className="stack">
        <div className="card stack">
          <div className="row between"><h3 style={{ margin: 0 }}>Your house</h3><span className="tiny">{dirty ? "Saving…" : "Saved"}</span></div>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <div className="stat"><span className="tiny">Floor area</span><b>{floorArea(house.rooms).toFixed(0)} m²</b></div>
            <div className="stat"><span className="tiny">Rooms</span><b>{house.rooms.length}</b></div>
            <div className="stat"><span className="tiny">Doors · windows</span><b>{ops.filter((o) => o.kind !== "window" && o.kind !== "opening").length} · {ops.filter((o) => o.kind === "window").length}</b></div>
            <div className="stat"><span className="tiny">Renovation est.</span><b>{estimate ? money.format(estimate.total) : "—"}</b></div>
          </div>
          <label className="field">Ceiling height (m)<input type="number" min={2.2} max={6} step={0.1} value={house.height} onChange={(e) => update({ ...house, height: Math.max(2.2, Number(e.target.value) || 2.7) })} /></label>
          <button className="btn sm ghost" onClick={() => goTo("estimate")}>See the full room-by-room estimate →</button>
        </div>

        <div className="card stack">
          <div className="row between"><h3 style={{ margin: 0 }}>Rooms</h3>
            <select value="" onChange={(e) => { if (e.target.value) addRoom(e.target.value); }} style={{ width: 130 }} aria-label="Add room">
              <option value="">+ Add room</option>
              {catalog.roomTypes.filter((t) => t !== "Whole home").map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="stack" style={{ gap: 4, maxHeight: 220, overflowY: "auto" }}>
            {house.rooms.map((r) => (
              <button key={r.id} className={`btn sm ${r.id === roomId ? "accent" : "ghost"}`} style={{ justifyContent: "space-between" }} onClick={() => { setRoomId(r.id); setItemId(null); }}>
                <span>{r.name}</span><span className="tiny">{(r.length * r.width).toFixed(1)} m²{estimate?.rooms.find((x) => x.id === r.id) ? ` · ${money.format(estimate.rooms.find((x) => x.id === r.id)!.total)}` : ""}</span>
              </button>
            ))}
          </div>
          {overlaps.length > 0 && <div className="chip bad" style={{ whiteSpace: "normal" }}>⛔ {overlaps.map(([a, c]) => `${a.name} overlaps ${c.name}`).join("; ")}</div>}
        </div>

        {room && (
          <div className="card stack">
            <div className="row between"><h3 style={{ margin: 0 }}>{room.name}</h3><button className="btn sm danger" onClick={() => deleteRoom(room.id)}>Delete</button></div>
            <input value={room.name} onChange={(e) => patchRoom(room.id, { name: e.target.value || "Room" })} aria-label="Room name" />
            <select value={room.type} onChange={(e) => patchRoom(room.id, { type: e.target.value })} aria-label="Room type">{catalog.roomTypes.filter((t) => t !== "Whole home").map((t) => <option key={t}>{t}</option>)}</select>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="field">Length (m)<input type="number" min={0.8} max={40} step={0.1} value={room.length} onChange={(e) => patchRoom(room.id, { length: Math.max(0.8, Number(e.target.value) || 1) })} /></label>
              <label className="field">Width (m)<input type="number" min={0.8} max={40} step={0.1} value={room.width} onChange={(e) => patchRoom(room.id, { width: Math.max(0.8, Number(e.target.value) || 1) })} /></label>
            </div>
            <label className="field">Floor
              <select value={room.floor ?? ""} onChange={(e) => patchRoom(room.id, { floor: e.target.value || null })}>
                <option value="">Project default</option>
                {catalog.materials.filter((m) => m.category === "flooring").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            <label className="field">Walls
              <select value={room.wall ?? ""} onChange={(e) => patchRoom(room.id, { wall: e.target.value || null })}>
                <option value="">Project default</option>
                {catalog.materials.filter((m) => m.category === "wall").map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </label>
            {room.type === "Bathroom" && <label className="check"><input type="checkbox" checked={!!room.ensuite} onChange={(e) => patchRoom(room.id, { ensuite: e.target.checked })} /> En-suite (door to bedroom only)</label>}
            <p className="tiny" style={{ margin: 0 }}>Drag rooms on the plan (Rooms mode) — walls, doors and windows update automatically.</p>
          </div>
        )}

        <div className="card stack">
          <h3 style={{ margin: 0 }}>Furniture</h3>
          <button className="btn sm accent" onClick={furnish}>✦ Auto-furnish whole house</button>
          <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Product category">{["Furniture", "Decor", "Lighting", "Appliances", "Fixtures"].map((c) => <option key={c}>{c}</option>)}</select>
          <div className="stack" style={{ maxHeight: 200, overflowY: "auto", gap: 6 }}>
            {products.filter((x) => x.category === category).map((x) => (
              <button key={x.id} className="btn sm" style={{ justifyContent: "space-between", whiteSpace: "normal", textAlign: "left" }} onClick={() => addItem({ productId: x.id, name: x.name, color: x.color, ...x.size })}>
                <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><span className="swatch" style={{ background: x.color, width: 14, height: 14 }} />{x.name}</span><span className="tiny">{money.format(x.price)}</span>
              </button>
            ))}
          </div>
          <span className="tiny">Adds to {room ? room.name : "the first room"}. Switch the plan to Furniture mode to drag pieces.</span>
          {item && (
            <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <b className="small">{item.name}</b>
              <div className="row">
                <button className="btn sm" onClick={() => patchItem({ rotation: (item.rotation + 90) % 360 })}>⟳ Rotate</button>
                <input type="color" value={item.color} onChange={(e) => patchItem({ color: e.target.value })} aria-label="Colour" />
                <button className="btn sm danger" onClick={() => { update({ ...house, items: house.items.filter((i) => i.id !== item.id) }); setItemId(null); }}>Remove</button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>House check {issues.filter((i) => i.level !== "info").length === 0 ? <span className="chip good">✓ No problems</span> : <span className="chip warn">{issues.filter((i) => i.level !== "info").length} to review</span>}</div>
          {issues.filter((i) => i.level !== "info").slice(0, 8).map((iss, i) => (
            <button key={i} className="btn ghost sm" style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left", width: "100%" }} onClick={() => { if (iss.itemIds[0]) { setItemId(iss.itemIds[0]); setEditMode("furniture"); } }}>
              {iss.level === "error" ? "⛔" : "⚠️"} {iss.message}
            </button>
          ))}
        </div>
      </div>

      <div className="stack">
        <div className="row between">
          <div className="row" style={{ gap: 4 }}>
            {([["split", "Plan + 3D"], ["plan", "Floor plan"], ["3d", "3D overview"], ["walk", "🚶 Walk through"]] as const).map(([v, l]) => <button key={v} className={`btn sm ${view === v ? "primary" : ""}`} onClick={() => setView(v)}>{l}</button>)}
          </div>
          <div className="row" style={{ gap: 4 }}>
            {(view === "split" || view === "3d") && <button className="btn sm" onClick={() => setWalls(walls === "cutaway" ? "full" : "cutaway")}>{walls === "cutaway" ? "Full-height walls" : "Cutaway walls"}</button>}
            {show3d && <button className="btn sm accent" onClick={send} disabled={sending}>{sending ? "Sending…" : "📸 Photo-real AI render of this view"}</button>}
          </div>
        </div>
        {show3d && (
          <div className="canvas-wrap" style={{ height: view === "split" ? "min(52vh, 480px)" : "min(70vh, 640px)" }}>
            <Suspense fallback={<p className="muted" style={{ padding: 16 }}>Loading 3D…</p>}>
              <HouseScene
                rooms={house.rooms} openings={ops} items={house.items} height={house.height} mats={mats}
                selectedId={itemId} onSelect={(id) => { setItemId(id); if (id) setEditMode("furniture"); }} onMove={moveItem}
                mode={view === "walk" ? "walk" : "orbit"} walls={walls} captureRef={capture}
              />
            </Suspense>
            {view === "walk" && <WalkPad />}
          </div>
        )}
        {showPlan && (
          <>
            <div className="row">
              <span className="small">Plan mode:</span>
              <button className={`btn sm ${editMode === "rooms" ? "primary" : ""}`} onClick={() => setEditMode("rooms")}>Rooms</button>
              <button className={`btn sm ${editMode === "furniture" ? "primary" : ""}`} onClick={() => setEditMode("furniture")}>Furniture</button>
              <span className="tiny">{(b.maxX - b.minX).toFixed(1)} × {(b.maxZ - b.minZ).toFixed(1)} m footprint</span>
            </div>
            <PlanView
              rooms={house.rooms} ops={ops} items={house.items} mode={editMode}
              selectedRoomId={roomId} selectedItemId={itemId}
              onSelectRoom={(id) => { setRoomId(id); if (id) setItemId(null); }} onSelectItem={setItemId}
              onMoveRoom={moveRoom} onMoveItem={moveItem}
              floorColor={(r) => mats.floorColor(r).color}
            />
          </>
        )}
        <p className="tiny">{view === "walk" ? "Walk with W A S D or the arrow keys (Q/E to turn), drag to look around — or use the on-screen pad." : "Orbit with left-drag, zoom with scroll/pinch. Outside walls facing you hide automatically so you can see in."}</p>
      </div>
    </div>
  );
}

/** On-screen movement pad for touch screens. */
function WalkPad() {
  const send = (f: number, s: number, t: number) => window.dispatchEvent(new CustomEvent("vistora:walkpad", { detail: { f, s, t } }));
  const btn = (label: string, f: number, s: number, t: number) => (
    <button className="btn sm" style={{ width: 40, height: 40, padding: 0 }} aria-label={label}
      onPointerDown={() => send(f, s, t)} onPointerUp={() => send(0, 0, 0)} onPointerLeave={() => send(0, 0, 0)}>{label}</button>
  );
  return (
    <div style={{ position: "absolute", right: 14, bottom: 14, display: "grid", gridTemplateColumns: "repeat(3, 40px)", gap: 4 }} className="no-print">
      <span />{btn("↑", 1, 0, 0)}<span />
      {btn("↶", 0, 0, 1)}{btn("↓", -1, 0, 0)}{btn("↷", 0, 0, -1)}
    </div>
  );
}
