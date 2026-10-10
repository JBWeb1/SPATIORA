import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, Edges, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { api } from "../api";
import { uid } from "../components/ui";
import { useCatalog, useMoney, useToast } from "../state";
import type { LayoutItem, Product, Room } from "../types";
import type { TabProps } from "./context";

const GENERIC: Omit<LayoutItem, "id" | "x" | "z" | "rotation">[] = [
  { name: "Built-in cupboard", color: "#d9d2c5", w: 1.2, d: 0.6, h: 2.2 },
  { name: "Kitchen counter run", color: "#e8e4dc", w: 2.4, d: 0.6, h: 0.9 },
  { name: "Rug", color: "#b7a68b", w: 2.4, d: 1.7, h: 0.01 },
  { name: "TV unit", color: "#3a3532", w: 1.8, d: 0.45, h: 0.5 },
  { name: "Plant", color: "#55784e", w: 0.5, d: 0.5, h: 1.3 },
];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function footprint(it: LayoutItem) {
  const r = ((it.rotation % 180) + 180) % 180;
  return r === 90 ? { w: it.d, d: it.w } : { w: it.w, d: it.d };
}

function clampToRoom(it: LayoutItem, room: Room): LayoutItem {
  const f = footprint(it);
  return { ...it, x: clamp(it.x, -room.length / 2 + f.w / 2, room.length / 2 - f.w / 2), z: clamp(it.z, -room.width / 2 + f.d / 2, room.width / 2 - f.d / 2) };
}

function RoomShell({ room, floor, wall, onFloorMove, onFloorUp }: { room: Room; floor: string; wall: string; onFloorMove: (p: THREE.Vector3) => void; onFloorUp: () => void }) {
  const windows = Array.from({ length: room.windows }, (_, i) => i);
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} receiveShadow onPointerMove={(e) => onFloorMove(e.point)} onPointerUp={onFloorUp}>
        <planeGeometry args={[room.length, room.width]} />
        <meshStandardMaterial color={floor} roughness={0.75} />
      </mesh>
      <mesh position={[0, room.height / 2, 0]} receiveShadow>
        <boxGeometry args={[room.length, room.height, room.width]} />
        <meshStandardMaterial color={wall} side={THREE.BackSide} roughness={0.95} />
      </mesh>
      {windows.map((i) => (
        <mesh key={i} position={[(-room.length / 2) + room.length * ((i + 1) / (room.windows + 1)), room.height * 0.55, -room.width / 2 + 0.01]}>
          <planeGeometry args={[Math.min(1.4, room.length / (room.windows + 1) * 0.8), room.height * 0.45]} />
          <meshStandardMaterial color="#cfe6f2" emissive="#cfe6f2" emissiveIntensity={0.35} />
        </mesh>
      ))}
      {Array.from({ length: room.doors }, (_, i) => (
        <mesh key={`d${i}`} position={[-room.length / 2 + 0.01, 1.03, -room.width / 2 + 1 + i * 1.4]} rotation-y={Math.PI / 2}>
          <planeGeometry args={[0.85, 2.06]} />
          <meshStandardMaterial color="#8a6e4f" />
        </mesh>
      ))}
    </group>
  );
}

function Furniture({ item, selected, onSelect, onDragStart }: { item: LayoutItem; selected: boolean; onSelect: () => void; onDragStart: () => void }) {
  return (
    <mesh
      position={[item.x, item.h / 2, item.z]}
      rotation-y={(item.rotation * Math.PI) / 180}
      castShadow
      receiveShadow
      onPointerDown={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onSelect(); onDragStart(); }}
    >
      <boxGeometry args={[item.w, item.h, item.d]} />
      <meshStandardMaterial color={item.color} roughness={0.6} />
      {selected && <Edges color="#c9a46a" lineWidth={2} />}
    </mesh>
  );
}

function Scene3D({ room, items, selectedId, floor, wall, light, onSelect, onMove }: {
  room: Room; items: LayoutItem[]; selectedId: string | null; floor: string; wall: string; light: { sun: number; warmth: number; lamps: boolean };
  onSelect: (id: string | null) => void; onMove: (id: string, x: number, z: number) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => {
    const up = () => setDragId(null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  const sunAngle = (light.sun / 24) * Math.PI * 2 - Math.PI / 2;
  const daylight = Math.max(0, Math.sin(((light.sun - 6) / 12) * Math.PI));
  const lampColor = new THREE.Color().setHSL(0.09, 0.8 * light.warmth, 0.7);
  return (
    <Canvas shadows camera={{ position: [room.length * 0.9, room.height * 1.8, room.width * 1.3], fov: 45 }} onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={[daylight > 0.1 ? "#d9e3ea" : "#1d2229"]} />
      <ambientLight intensity={0.25 + daylight * 0.45} />
      <directionalLight
        castShadow
        position={[Math.cos(sunAngle) * 8, 6 + daylight * 4, Math.sin(sunAngle) * 6 - 4]}
        intensity={daylight * 1.6}
        shadow-mapSize={[1024, 1024]}
      />
      {light.lamps && <pointLight position={[0, room.height - 0.3, 0]} intensity={8} distance={Math.max(room.length, room.width) * 1.6} color={lampColor} castShadow />}
      <RoomShell room={room} floor={floor} wall={wall} onFloorMove={(p) => dragId && onMove(dragId, p.x, p.z)} onFloorUp={() => setDragId(null)} />
      {items.map((it) => (
        <Furniture key={it.id} item={it} selected={it.id === selectedId} onSelect={() => onSelect(it.id)} onDragStart={() => setDragId(it.id)} />
      ))}
      <ContactShadows position={[0, 0.005, 0]} opacity={0.35} scale={Math.max(room.length, room.width) * 1.2} blur={2} far={3} />
      <OrbitControls enabled={!dragId} target={[0, 0.8, 0]} maxPolarAngle={Math.PI / 2.05} minDistance={2} maxDistance={30} />
    </Canvas>
  );
}

function Plan2D({ room, items, selectedId, floor, onSelect, onMove }: { room: Room; items: LayoutItem[]; selectedId: string | null; floor: string; onSelect: (id: string | null) => void; onMove: (id: string, x: number, z: number) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dz: number } | null>(null);
  const pad = 0.4;
  const toRoom = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: p.x, z: p.y };
  };
  const grid = [];
  for (let x = Math.ceil(-room.length / 2); x <= room.length / 2; x++) grid.push(<line key={`x${x}`} x1={x} x2={x} y1={-room.width / 2} y2={room.width / 2} stroke="rgba(0,0,0,.08)" strokeWidth={0.01} />);
  for (let z = Math.ceil(-room.width / 2); z <= room.width / 2; z++) grid.push(<line key={`z${z}`} y1={z} y2={z} x1={-room.length / 2} x2={room.length / 2} stroke="rgba(0,0,0,.08)" strokeWidth={0.01} />);
  return (
    <svg
      ref={svgRef}
      className="plan"
      viewBox={`${-room.length / 2 - pad} ${-room.width / 2 - pad} ${room.length + pad * 2} ${room.width + pad * 2}`}
      onPointerMove={(e) => { if (!drag.current) return; const p = toRoom(e); onMove(drag.current.id, p.x - drag.current.dx, p.z - drag.current.dz); }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { drag.current = null; }}
      onPointerDown={(e) => e.target === e.currentTarget && onSelect(null)}
    >
      <rect x={-room.length / 2} y={-room.width / 2} width={room.length} height={room.width} fill={floor} opacity={0.35} stroke="var(--ink)" strokeWidth={0.08} />
      {grid}
      <text x={0} y={-room.width / 2 - 0.12} fontSize={0.18} textAnchor="middle" fill="var(--ink-2)">{room.length.toFixed(2)} m</text>
      <text x={-room.length / 2 - 0.12} y={0} fontSize={0.18} textAnchor="middle" fill="var(--ink-2)" transform={`rotate(-90 ${-room.length / 2 - 0.12} 0)`}>{room.width.toFixed(2)} m</text>
      {items.map((it) => (
        <g
          key={it.id}
          className={`item ${it.id === selectedId ? "sel" : ""}`}
          transform={`translate(${it.x} ${it.z}) rotate(${it.rotation})`}
          onPointerDown={(e) => { e.stopPropagation(); (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId); const p = toRoom(e); drag.current = { id: it.id, dx: p.x - it.x, dz: p.z - it.z }; onSelect(it.id); }}
        >
          <rect x={-it.w / 2} y={-it.d / 2} width={it.w} height={it.d} fill={it.color} opacity={0.9} stroke="rgba(0,0,0,.4)" strokeWidth={0.02} rx={0.04} />
          <text fontSize={Math.min(0.16, it.w / 6)} textAnchor="middle" dominantBaseline="middle" fill="#fff" stroke="rgba(0,0,0,.6)" strokeWidth={0.008} pointerEvents="none">{it.name.slice(0, 18)}</text>
        </g>
      ))}
    </svg>
  );
}

export default function StudioTab({ bundle, save }: TabProps) {
  const catalog = useCatalog();
  const money = useMoney();
  const toast = useToast();
  const p = bundle.project;
  const [room, setRoom] = useState<Room>(p.room);
  const [items, setItems] = useState<LayoutItem[]>(p.layout);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"3d" | "plan" | "split">("split");
  const [light, setLight] = useState({ sun: 14, warmth: 0.6, lamps: true });
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("Furniture");
  const [dirty, setDirty] = useState(false);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => { api.get<{ products: Product[] }>("/products").then((r) => setProducts(r.products)).catch(() => {}); }, []);

  // Debounced auto-save of layout & room.
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(() => { saveRef.current({ layout: items, room }).then(() => setDirty(false)).catch(() => {}); }, 900);
    return () => clearTimeout(t);
  }, [items, room, dirty]);

  const floor = catalog.materials.find((m) => m.id === p.finishes.flooring)?.color ?? "#b9a58a";
  const wall = catalog.materials.find((m) => m.id === p.finishes.wall)?.color ?? "#efebe4";
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const furnitureValue = useMemo(() => items.reduce((s, i) => s + (products.find((x) => x.id === i.productId)?.price ?? 0), 0), [items, products]);

  const update = (next: LayoutItem[]) => { setItems(next); setDirty(true); };
  const move = (id: string, x: number, z: number) => update(items.map((i) => (i.id === id ? clampToRoom({ ...i, x, z }, room) : i)));
  const patchSel = (patch: Partial<LayoutItem>) => selected && update(items.map((i) => (i.id === selected.id ? clampToRoom({ ...i, ...patch }, room) : i)));
  const add = (base: Omit<LayoutItem, "id" | "x" | "z" | "rotation">) => {
    if (base.w > room.length && base.d > room.length) return toast.error(new Error("That item is larger than the room"));
    const it = clampToRoom({ ...base, id: uid(), x: 0, z: 0, rotation: 0 }, room);
    update([...items, it]);
    setSelectedId(it.id);
  };
  const setRoomField = (k: keyof Room, v: number) => { const r = { ...room, [k]: v }; setRoom(r); setItems((its) => its.map((i) => clampToRoom(i, r))); setDirty(true); };
  const area = room.length * room.width;
  const occupied = items.filter((i) => i.h > 0.05).reduce((s, i) => s + i.w * i.d, 0);

  return (
    <div className="studio">
      <div className="stack">
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Room</h3>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <label className="field">Length<input type="number" min={1} max={40} step={0.1} value={room.length} onChange={(e) => setRoomField("length", Number(e.target.value) || 1)} /></label>
            <label className="field">Width<input type="number" min={1} max={40} step={0.1} value={room.width} onChange={(e) => setRoomField("width", Number(e.target.value) || 1)} /></label>
            <label className="field">Height<input type="number" min={2} max={8} step={0.1} value={room.height} onChange={(e) => setRoomField("height", Number(e.target.value) || 2.4)} /></label>
            <label className="field">Doors<input type="number" min={0} max={10} value={room.doors} onChange={(e) => setRoomField("doors", Math.max(0, Math.round(Number(e.target.value))))} /></label>
            <label className="field">Windows<input type="number" min={0} max={20} value={room.windows} onChange={(e) => setRoomField("windows", Math.max(0, Math.round(Number(e.target.value))))} /></label>
          </div>
          <div className="tiny">{area.toFixed(1)} m² · furniture covers {Math.round((occupied / area) * 100)}% of the floor {occupied / area > 0.45 && <span className="chip warn">feels crowded</span>}</div>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0 }}>Add furniture</h3>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            {["Furniture", "Decor", "Lighting", "Appliances", "Fixtures", "Generic"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="stack" style={{ maxHeight: 260, overflowY: "auto", gap: 6 }}>
            {category === "Generic" ? GENERIC.map((g) => (
              <button key={g.name} className="btn sm" style={{ justifyContent: "space-between" }} onClick={() => add(g)}><span>{g.name}</span><span className="tiny">{g.w}×{g.d}m</span></button>
            )) : products.filter((x) => x.category === category).map((x) => (
              <button key={x.id} className="btn sm" style={{ justifyContent: "space-between", whiteSpace: "normal", textAlign: "left" }} onClick={() => add({ productId: x.id, name: x.name, color: x.color, ...x.size })}>
                <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><span className="swatch" style={{ background: x.color, width: 14, height: 14 }} />{x.name}</span><span className="tiny">{money.format(x.price)}</span>
              </button>
            ))}
          </div>
        </div>

        {selected && (
          <div className="card stack">
            <div className="row between"><h3 style={{ margin: 0 }}>Selected</h3><button className="btn sm danger" onClick={() => { update(items.filter((i) => i.id !== selected.id)); setSelectedId(null); }}>Remove</button></div>
            <input value={selected.name} onChange={(e) => patchSel({ name: e.target.value })} />
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
              <label className="field">W<input type="number" step={0.05} min={0.05} value={selected.w} onChange={(e) => patchSel({ w: Math.max(0.05, Number(e.target.value)) })} /></label>
              <label className="field">D<input type="number" step={0.05} min={0.05} value={selected.d} onChange={(e) => patchSel({ d: Math.max(0.05, Number(e.target.value)) })} /></label>
              <label className="field">H<input type="number" step={0.05} min={0.01} value={selected.h} onChange={(e) => patchSel({ h: Math.max(0.01, Number(e.target.value)) })} /></label>
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => patchSel({ rotation: (selected.rotation + 90) % 360 })}>⟳ Rotate 90°</button>
              <input type="color" value={selected.color} onChange={(e) => patchSel({ color: e.target.value })} aria-label="Colour" />
              <button className="btn sm" onClick={() => add({ ...selected, name: `${selected.name} copy` })}>Duplicate</button>
            </div>
          </div>
        )}

        <div className="card stack">
          <h3 style={{ margin: 0 }}>Lighting</h3>
          <label className="field">Time of day: {String(Math.floor(light.sun)).padStart(2, "0")}:{light.sun % 1 ? "30" : "00"}
            <input type="range" min={0} max={23.5} step={0.5} value={light.sun} onChange={(e) => setLight({ ...light, sun: Number(e.target.value) })} />
          </label>
          <label className="field">Lamp warmth<input type="range" min={0} max={1} step={0.05} value={light.warmth} onChange={(e) => setLight({ ...light, warmth: Number(e.target.value) })} /></label>
          <label className="check"><input type="checkbox" checked={light.lamps} onChange={(e) => setLight({ ...light, lamps: e.target.checked })} /> Ceiling lights on</label>
        </div>
      </div>

      <div className="stack">
        <div className="row between">
          <div className="row" style={{ gap: 4 }}>
            {(["split", "3d", "plan"] as const).map((v) => <button key={v} className={`btn sm ${view === v ? "primary" : ""}`} onClick={() => setView(v)}>{v === "3d" ? "3D view" : v === "plan" ? "Floor plan" : "Split"}</button>)}
          </div>
          <span className="tiny">{dirty ? "Saving…" : "All changes saved"} · {items.length} items · catalogue value {money.format(furnitureValue)}</span>
        </div>
        {view !== "plan" && (
          <div className="canvas-wrap">
            <Suspense fallback={null}>
              <Scene3D room={room} items={items} selectedId={selectedId} floor={floor} wall={wall} light={light} onSelect={setSelectedId} onMove={move} />
            </Suspense>
          </div>
        )}
        {view !== "3d" && <Plan2D room={room} items={items} selectedId={selectedId} floor={floor} onSelect={setSelectedId} onMove={move} />}
        <p className="tiny">Drag items on the floor plan or in 3D. Orbit with left-drag, zoom with scroll/pinch. Change flooring and wall finishes in the Materials tab.</p>
      </div>
    </div>
  );
}
