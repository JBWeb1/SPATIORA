import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { LayoutItem } from "../../types";
import { exteriorSpans, houseBounds, isOutdoor, type HouseRoom, type Opening, type Side } from "../../../../server/src/shared/house";
import { FurnitureModel } from "./Furniture";
import { materialTexture, roughnessFor } from "./textures";

export const WALL_T = 0.12; // each room draws half of a shared wall
const HALF = WALL_T / 2;

export interface SceneMaterials { floorColor: (r: HouseRoom) => { id: string | null; color: string }; wallColor: (r: HouseRoom) => { id: string | null; color: string } }
export interface Box2 { x1: number; z1: number; x2: number; z2: number }

interface Piece { key: string; roomId: string; side: Side; exterior: boolean; cx: number; cz: number; cy: number; len: number; h: number; horizontal: boolean; normal: [number, number] }

const inward: Record<Side, [number, number]> = { n: [0, 1], s: [0, -1], w: [1, 0], e: [-1, 0] };
const opposite: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };

/** Split every room wall into solid pieces around its doors and windows. */
export function buildWalls(rooms: HouseRoom[], ops: Opening[], height: number): Piece[] {
  const pieces: Piece[] = [];
  for (const r of rooms) {
    if (isOutdoor(r)) continue;
    for (const side of ["n", "s", "w", "e"] as Side[]) {
      const horizontal = side === "n" || side === "s";
      const start = horizontal ? r.x : r.z;
      const end = horizontal ? r.x + r.length : r.z + r.width;
      const line = side === "n" ? r.z + HALF : side === "s" ? r.z + r.width - HALF : side === "w" ? r.x + HALF : r.x + r.length - HALF;
      const ext = exteriorSpans(r, side, rooms);
      const isExt = (u: number) => ext.some(([a, b]) => u >= a - 0.01 && u <= b + 0.01);
      const holes = ops
        .filter((o) => (o.roomId === r.id && o.side === side) || (o.otherId === r.id && o.side === opposite[side]))
        .map((o) => ({ c: horizontal ? o.x : o.z, w: o.width, sill: o.sill, head: o.head }))
        .sort((a, b) => a.c - b.c);
      const add = (u1: number, u2: number, y1: number, y2: number, tag: string) => {
        if (u2 - u1 < 0.01 || y2 - y1 < 0.01) return;
        const mid = (u1 + u2) / 2;
        pieces.push({
          key: `${r.id}-${side}-${tag}-${u1.toFixed(2)}`, roomId: r.id, side, exterior: isExt(mid),
          cx: horizontal ? mid : line, cz: horizontal ? line : mid, cy: (y1 + y2) / 2, len: u2 - u1, h: y2 - y1, horizontal, normal: inward[side],
        });
      };
      let cursor = start;
      for (const hole of holes) {
        const a = hole.c - hole.w / 2, b = hole.c + hole.w / 2;
        add(cursor, a, 0, height, "s");
        if (hole.sill > 0) add(a, b, 0, hole.sill, "b");
        if (hole.head < height) add(a, b, hole.head, height, "t");
        cursor = b;
      }
      add(cursor, end, 0, height, "s");
    }
  }
  return pieces;
}

function WallPiece({ p, color, matId, cut, hideFacing }: { p: Piece; color: string; matId: string | null; cut: number | null; hideFacing: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const top = p.cy + p.h / 2;
  const bottom = p.cy - p.h / 2;
  const clippedTop = cut != null ? Math.min(top, cut) : top;
  const h = clippedTop - bottom;
  const map = useMemo(() => materialTexture(matId, color, p.len, Math.max(h, 0.1)), [matId, color, p.len, h]);
  useFrame(({ camera }) => {
    if (!ref.current) return;
    if (!hideFacing || !p.exterior) { ref.current.visible = true; return; }
    // Dollhouse view: hide outside walls between the camera and the room.
    const dx = camera.position.x - p.cx, dz = camera.position.z - p.cz;
    ref.current.visible = dx * -p.normal[0] + dz * -p.normal[1] < 0;
  });
  if (h <= 0.01) return null;
  const size: [number, number, number] = p.horizontal ? [p.len, h, WALL_T / 2] : [WALL_T / 2, h, p.len];
  const skirt = bottom < 0.01 && h > 0.15;
  const off = HALF / 2;
  return (
    <group ref={ref}>
      <mesh position={[p.cx - p.normal[0] * off, bottom + h / 2, p.cz - p.normal[1] * off]} castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} map={map} roughness={0.92} />
      </mesh>
      {cut != null && clippedTop < top && (
        <mesh position={[p.cx - p.normal[0] * off, clippedTop + 0.005, p.cz - p.normal[1] * off]}>
          <boxGeometry args={p.horizontal ? [p.len, 0.01, WALL_T / 2] : [WALL_T / 2, 0.01, p.len]} />
          <meshStandardMaterial color="#3a3530" />
        </mesh>
      )}
      {skirt && (
        <mesh position={[p.cx + p.normal[0] * 0.006, 0.05, p.cz + p.normal[1] * 0.006]} castShadow>
          <boxGeometry args={p.horizontal ? [p.len, 0.1, 0.014] : [0.014, 0.1, p.len]} />
          <meshStandardMaterial color="#f3f1ec" roughness={0.5} />
        </mesh>
      )}
    </group>
  );
}

function OpeningMesh({ o, rooms, height, cut, hideFacing }: { o: Opening; rooms: HouseRoom[]; height: number; cut: number | null; hideFacing: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const room = rooms.find((r) => r.id === o.roomId)!;
  const horizontal = o.side === "n" || o.side === "s";
  const n = inward[o.side];
  const exterior = !o.otherId || o.kind === "front-door";
  useFrame(({ camera }) => {
    if (!ref.current) return;
    if (!hideFacing || !exterior) { ref.current.visible = true; return; }
    const dx = camera.position.x - o.x, dz = camera.position.z - o.z;
    ref.current.visible = dx * -n[0] + dz * -n[1] < 0;
  });
  // On the shared wall line between rooms (exterior openings sit on the room's own edge).
  const lineOffset = o.otherId ? 0 : HALF;
  const cx = o.x + n[0] * lineOffset, cz = o.z + n[1] * lineOffset;
  const rotY = horizontal ? 0 : Math.PI / 2;
  const head = Math.min(o.head, height);
  if (o.kind === "opening") return null;
  if (o.kind === "window") {
    if (cut != null && cut < o.sill + 0.2) {
      return (
        <group ref={ref} position={[cx, o.sill, cz]} rotation-y={rotY}>
          <mesh position={[0, 0.02, 0]}><boxGeometry args={[o.width + 0.1, 0.04, WALL_T + 0.06]} /><meshStandardMaterial color="#f2f0ea" /></mesh>
        </group>
      );
    }
    const top = cut != null ? Math.min(head, cut) : head;
    const h = top - o.sill;
    const fr = 0.05;
    return (
      <group ref={ref} position={[cx, o.sill, cz]} rotation-y={rotY}>
        <mesh position={[0, 0.02, 0]} castShadow><boxGeometry args={[o.width + 0.1, 0.04, WALL_T + 0.08]} /><meshStandardMaterial color="#f2f0ea" roughness={0.4} /></mesh>
        {[[0, h - fr / 2, o.width, fr], [0, fr / 2 + 0.04, o.width, fr], [-o.width / 2 + fr / 2, h / 2, fr, h], [o.width / 2 - fr / 2, h / 2, fr, h], [0, h / 2, fr * 0.7, h]].map(([x, y, w, hh], i) => (
          <mesh key={i} position={[x, y, 0]} castShadow><boxGeometry args={[w, hh, 0.07]} /><meshStandardMaterial color="#2f2f2f" roughness={0.4} metalness={0.4} /></mesh>
        ))}
        <mesh position={[0, h / 2, 0]}>
          <boxGeometry args={[o.width - fr, h - fr, 0.01]} />
          <meshPhysicalMaterial color="#cfe3ee" transparent opacity={0.22} roughness={0.05} metalness={0.1} />
        </mesh>
      </group>
    );
  }
  // Doors: frame + leaf. Interior doors stand open into the room; the front door is closed.
  const open = o.kind === "door";
  const hinge = -o.width / 2;
  const leafH = Math.min(2.04, head - 0.02);
  // Doors swing into rooms, never out into a passage.
  const intoOwner = room?.type !== "Entrance & hallway";
  const swingSign = ((o.side === "n" || o.side === "w") ? 1 : -1) * (intoOwner ? 1 : -1);
  return (
    <group ref={ref} position={[cx, 0, cz]} rotation-y={rotY}>
      {(cut == null || cut > 2.0) && <mesh position={[0, head + 0.03, 0]}><boxGeometry args={[o.width + 0.14, 0.06, WALL_T + 0.04]} /><meshStandardMaterial color="#efece6" /></mesh>}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (o.width / 2 + 0.035), Math.min(head, cut ?? head) / 2, 0]}><boxGeometry args={[0.07, Math.min(head, cut ?? head), WALL_T + 0.04]} /><meshStandardMaterial color="#efece6" /></mesh>
      ))}
      <group position={[hinge, 0, 0]} rotation-y={open ? swingSign * 1.25 : 0}>
        <mesh position={[o.width / 2, leafH / 2, 0]} castShadow>
          <boxGeometry args={[o.width - 0.02, Math.min(leafH, cut ?? leafH), 0.04]} />
          <meshStandardMaterial color={o.kind === "front-door" ? "#5a3b25" : "#e9e4da"} roughness={0.55} />
        </mesh>
        <mesh position={[o.width - 0.1, 1.0, 0.04]}><sphereGeometry args={[0.025, 10, 8]} /><meshStandardMaterial color="#b9b9b9" metalness={0.9} roughness={0.25} /></mesh>
      </group>
    </group>
  );
}

function RoomFloor({ r, mats, onMove, onUp }: { r: HouseRoom; mats: SceneMaterials; onMove: (p: THREE.Vector3) => void; onUp: () => void }) {
  const outdoor = isOutdoor(r);
  const f = mats.floorColor(r);
  const map = useMemo(() => outdoor ? materialTexture("deck", f.color, r.length, r.width, "deck") : materialTexture(f.id, f.color, r.length, r.width, "planks"), [f.id, f.color, r.length, r.width, outdoor]);
  return (
    <mesh position={[r.x + r.length / 2, 0.003, r.z + r.width / 2]} rotation-x={-Math.PI / 2} receiveShadow onPointerMove={(e) => onMove(e.point)} onPointerUp={onUp}>
      <planeGeometry args={[r.length, r.width]} />
      <meshStandardMaterial color={outdoor ? "#a9875f" : f.color} map={map} roughness={outdoor ? 0.85 : roughnessFor(f.id)} />
    </mesh>
  );
}

function Capture({ captureRef }: { captureRef?: MutableRefObject<(() => string) | null> }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    if (!captureRef) return;
    captureRef.current = () => { gl.render(scene, camera); return gl.domElement.toDataURL("image/jpeg", 0.92); };
    return () => { captureRef.current = null; };
  }, [captureRef, gl, scene, camera]);
  return null;
}

/** First-person walk-through: drag to look, WASD/arrow keys (or on-screen pad) to move, walls block you. */
function WalkControls({ start, yaw0, solids, bounds }: { start: [number, number]; yaw0: number; solids: Box2[]; bounds: Box2 }) {
  const { camera, gl } = useThree();
  const yaw = useRef(yaw0), pitch = useRef(-0.05);
  const keys = useRef(new Set<string>());
  const pad = useRef<{ f: number; s: number; t: number }>({ f: 0, s: 0, t: 0 });
  useEffect(() => {
    camera.position.set(start[0], 1.6, start[1]);
    yaw.current = yaw0;
    (camera as THREE.PerspectiveCamera).fov = 70;
    (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
  }, [start, yaw0, camera]);
  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      yaw.current -= (e.clientX - drag.x) * 0.005;
      pitch.current = Math.max(-1.1, Math.min(1.1, pitch.current - (e.clientY - drag.y) * 0.004));
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => { drag = null; };
    const kd = (e: KeyboardEvent) => { if (/^(Arrow|Key[WASDQE])/.test(e.code)) { keys.current.add(e.code); e.preventDefault(); } };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.code);
    const padEv = (e: Event) => { pad.current = (e as CustomEvent).detail; };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("vistora:walkpad", padEv);
    return () => {
      el.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("vistora:walkpad", padEv);
    };
  }, [gl]);
  useFrame((_, dt) => {
    const k = keys.current;
    const fwd = (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) - (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0) + pad.current.f;
    const strafe = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0) + pad.current.s;
    yaw.current += ((k.has("ArrowLeft") || k.has("KeyQ") ? 1 : 0) - (k.has("ArrowRight") || k.has("KeyE") ? 1 : 0) + pad.current.t) * dt * 1.6;
    const speed = 1.8 * Math.min(dt, 0.05);
    const dx = (-Math.sin(yaw.current) * fwd + Math.cos(yaw.current) * strafe) * speed;
    const dz = (-Math.cos(yaw.current) * fwd - Math.sin(yaw.current) * strafe) * speed;
    const R = 0.22;
    const blocked = (x: number, z: number) => x < bounds.x1 - 3 || x > bounds.x2 + 3 || z < bounds.z1 - 3 || z > bounds.z2 + 3 ||
      solids.some((b) => x > b.x1 - R && x < b.x2 + R && z > b.z1 - R && z < b.z2 + R);
    const p = camera.position;
    if (!blocked(p.x + dx, p.z)) p.x += dx;
    if (!blocked(p.x, p.z + dz)) p.z += dz;
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
  });
  return null;
}

export interface HouseSceneProps {
  rooms: HouseRoom[];
  openings: Opening[];
  items: LayoutItem[];
  height: number;
  mats: SceneMaterials;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  mode: "orbit" | "walk";
  walls: "full" | "cutaway";
  sun?: number; // hour of day
  lampsOn?: boolean;
  captureRef?: MutableRefObject<(() => string) | null>;
}

export default function HouseScene(props: HouseSceneProps) {
  const { rooms, openings: ops, items, height, mats, selectedId, onSelect, onMove, mode, walls, sun = 14, lampsOn = true, captureRef } = props;
  const [dragId, setDragId] = useState<string | null>(null);
  useEffect(() => {
    const up = () => setDragId(null);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);
  const b = houseBounds(rooms);
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ, 3);
  const pieces = useMemo(() => buildWalls(rooms, ops, height), [rooms, ops, height]);
  const cut = mode === "orbit" && walls === "cutaway" ? 1.15 : null;
  const hideFacing = mode === "orbit";
  const solids = useMemo<Box2[]>(() => pieces.filter((p) => p.cy - p.h / 2 < 1.0).map((p) => p.horizontal
    ? { x1: p.cx - p.len / 2, x2: p.cx + p.len / 2, z1: p.cz - HALF, z2: p.cz + HALF }
    : { x1: p.cx - HALF, x2: p.cx + HALF, z1: p.cz - p.len / 2, z2: p.cz + p.len / 2 }), [pieces]);
  const walkStart = useMemo<{ pos: [number, number]; yaw: number }>(() => {
    const fd = ops.find((o) => o.kind === "front-door");
    if (fd) {
      const n = inward[fd.side];
      return { pos: [fd.x + n[0] * 1.0, fd.z + n[1] * 1.0], yaw: Math.atan2(-n[0], -n[1]) };
    }
    const r = rooms.find((x) => !isOutdoor(x)) ?? rooms[0];
    return { pos: [r ? r.x + r.length / 2 : 0, r ? r.z + r.width * 0.8 : 0], yaw: 0 };
  }, [ops, rooms]);
  const daylight = Math.max(0, Math.sin(((sun - 6) / 12) * Math.PI));
  const sunAngle = (sun / 24) * Math.PI * 2 - Math.PI / 2;
  const indoor = rooms.filter((r) => !isOutdoor(r));
  const lights = indoor.slice(0, 10);

  return (
    <Canvas shadows gl={{ preserveDrawingBuffer: true, antialias: true, toneMappingExposure: 1.15 }} camera={{ position: [cx + span * 0.55, span * 0.85 + 2, cz + span * 0.95], fov: 42 }} onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={[daylight > 0.1 ? "#dfe8ee" : "#1b2028"]} />
      <hemisphereLight args={["#f4f7fb", "#b5a48d", 0.7 + daylight * 0.5]} />
      <ambientLight intensity={mode === "walk" ? 0.55 : 0.25} color="#fff8ee" />
      <directionalLight
        castShadow
        position={[cx + Math.cos(sunAngle) * span, 4 + daylight * span * 0.8, cz + Math.sin(sunAngle) * span * 0.6 - span * 0.4]}
        intensity={0.4 + daylight * 1.9}
        color={daylight > 0.3 ? "#fff6e6" : "#ffd2a1"}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-span} shadow-camera-right={span} shadow-camera-top={span} shadow-camera-bottom={-span}
        shadow-bias={-0.0004}
        target-position={[cx, 0, cz]}
      />
      {lampsOn && lights.map((r) => (
        <pointLight key={r.id} position={[r.x + r.length / 2, height - 0.25, r.z + r.width / 2]} intensity={mode === "walk" ? 7 : 2.5} distance={Math.max(r.length, r.width) * 2.2} decay={1.3} color="#ffe9c9" />
      ))}
      <mesh position={[cx, -0.01, cz]} rotation-x={-Math.PI / 2} receiveShadow onPointerMove={(e) => dragId && onMove(dragId, e.point.x, e.point.z)} onPointerUp={() => setDragId(null)}>
        <planeGeometry args={[span * 5, span * 5]} />
        <meshStandardMaterial color="#9fae86" roughness={1} />
      </mesh>
      {rooms.map((r) => <RoomFloor key={r.id} r={r} mats={mats} onMove={(p) => dragId && onMove(dragId, p.x, p.z)} onUp={() => setDragId(null)} />)}
      {pieces.map((p) => { const w = mats.wallColor(rooms.find((r) => r.id === p.roomId)!); return <WallPiece key={p.key} p={p} color={w.color} matId={w.id} cut={cut} hideFacing={hideFacing} />; })}
      {ops.map((o, i) => <OpeningMesh key={`${o.kind}-${i}`} o={o} rooms={rooms} height={height} cut={cut} hideFacing={hideFacing} />)}
      {mode === "walk" && indoor.map((r) => (
        <group key={`c-${r.id}`}>
          <mesh position={[r.x + r.length / 2, height, r.z + r.width / 2]} rotation-x={Math.PI / 2}><planeGeometry args={[r.length, r.width]} /><meshStandardMaterial color="#f7f6f2" side={THREE.DoubleSide} /></mesh>
          <mesh position={[r.x + r.length / 2, height - 0.01, r.z + r.width / 2]} rotation-x={Math.PI / 2}><circleGeometry args={[0.12, 24]} /><meshStandardMaterial color="#fff6e0" emissive="#fff1d0" emissiveIntensity={lampsOn ? 1.5 : 0} side={THREE.DoubleSide} /></mesh>
        </group>
      ))}
      {items.map((it) => (
        <group
          key={it.id}
          position={[it.x, 0, it.z]}
          rotation-y={(-it.rotation * Math.PI) / 180}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => { if (mode !== "orbit") return; e.stopPropagation(); onSelect(it.id); setDragId(it.id); }}
        >
          <FurnitureModel item={it} ceiling={height} selected={it.id === selectedId} />
        </group>
      ))}
      {mode === "orbit"
        ? <OrbitControls makeDefault enabled={!dragId} target={[cx, 0.6, cz]} maxPolarAngle={Math.PI / 2.08} minDistance={2} maxDistance={span * 4} />
        : <WalkControls start={walkStart.pos} yaw0={walkStart.yaw} solids={solids} bounds={{ x1: b.minX, z1: b.minZ, x2: b.maxX, z2: b.maxZ }} />}
      <Capture captureRef={captureRef} />
    </Canvas>
  );
}
