import { useRef } from "react";
import { houseBounds, isOutdoor, type HouseRoom, type Opening } from "../../../server/src/shared/house";
import type { LayoutItem } from "../types";

const TYPE_TINT: Record<string, string> = {
  "Living room": "#f3e6cf", "Kitchen": "#e6efe0", "Bathroom": "#dcecf2", "Bedroom": "#ece3f1", "Dining room": "#f5e9d9",
  "Home office": "#e3e9f3", "Kids room": "#f6e7ea", "Patio & outdoor": "#e4ecd8", "Entrance & hallway": "#efede8", "Whole home": "#eee",
};

const snap = (v: number) => Math.round(v * 10) / 10;

export interface PlanViewProps {
  rooms: HouseRoom[];
  ops: Opening[];
  items?: LayoutItem[];
  mode?: "rooms" | "furniture" | "view";
  selectedRoomId?: string | null;
  selectedItemId?: string | null;
  onSelectRoom?: (id: string | null) => void;
  onSelectItem?: (id: string | null) => void;
  onMoveRoom?: (id: string, x: number, z: number) => void;
  onMoveItem?: (id: string, x: number, z: number) => void;
  floorColor?: (r: HouseRoom) => string;
  compact?: boolean;
}

/** Architectural floor plan: rooms, walls, doors with swings, windows and furniture. */
export default function PlanView({ rooms, ops, items = [], mode = "view", selectedRoomId, selectedItemId, onSelectRoom, onSelectItem, onMoveRoom, onMoveItem, floorColor, compact }: PlanViewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ kind: "room" | "item"; id: string; dx: number; dz: number } | null>(null);
  const b = houseBounds(rooms);
  const pad = compact ? 0.4 : 1.2;
  const vb = `${b.minX - pad} ${b.minZ - pad} ${b.maxX - b.minX + pad * 2} ${b.maxZ - b.minZ + pad * 2}`;
  const fs = Math.max(0.22, Math.min(0.42, (b.maxX - b.minX) / 40));
  const pt = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const r = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: r.x, z: r.y };
  };

  return (
    <svg
      ref={svgRef}
      className="plan"
      viewBox={vb}
      role="img"
      aria-label="Floor plan"
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const p = pt(e);
        if (d.kind === "room") onMoveRoom?.(d.id, snap(p.x - d.dx), snap(p.z - d.dz));
        else onMoveItem?.(d.id, p.x - d.dx, p.z - d.dz);
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { drag.current = null; }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) { onSelectRoom?.(null); onSelectItem?.(null); } }}
      style={{ background: "var(--surface-2)" }}
    >
      <defs>
        <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M1 0H0V1" fill="none" stroke="rgba(0,0,0,.06)" strokeWidth="0.02" /></pattern>
        <pattern id="deck" width="0.3" height="0.3" patternUnits="userSpaceOnUse"><path d="M0 0.15H0.3" stroke="rgba(90,70,40,.25)" strokeWidth="0.02" /></pattern>
      </defs>
      <rect x={b.minX - pad} y={b.minZ - pad} width={b.maxX - b.minX + pad * 2} height={b.maxZ - b.minZ + pad * 2} fill="url(#grid)" />
      {rooms.map((r) => {
        const sel = r.id === selectedRoomId;
        const outdoor = isOutdoor(r);
        return (
          <g
            key={r.id}
            style={{ cursor: mode === "rooms" ? "move" : mode === "view" ? "default" : "pointer" }}
            onPointerDown={(e) => {
              if (mode === "view") return;
              e.stopPropagation();
              onSelectRoom?.(r.id);
              if (mode === "rooms") { (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId); const p = pt(e); drag.current = { kind: "room", id: r.id, dx: p.x - r.x, dz: p.z - r.z }; }
            }}
          >
            <rect x={r.x} y={r.z} width={r.length} height={r.width} fill={TYPE_TINT[r.type] ?? "#eee"} />
            {floorColor && !outdoor && <rect x={r.x} y={r.z} width={r.length} height={r.width} fill={floorColor(r)} opacity={0.28} />}
            {outdoor && <rect x={r.x} y={r.z} width={r.length} height={r.width} fill="url(#deck)" />}
            <rect x={r.x} y={r.z} width={r.length} height={r.width} fill="none" stroke={outdoor ? "#8a8a7a" : "#2c2a27"} strokeWidth={outdoor ? 0.03 : 0.12} strokeDasharray={outdoor ? "0.15 0.1" : undefined} />
            {sel && <rect x={r.x + 0.08} y={r.z + 0.08} width={r.length - 0.16} height={r.width - 0.16} fill="none" stroke="#c9a46a" strokeWidth={0.07} />}
          </g>
        );
      })}
      {ops.map((o, i) => {
        const horizontal = o.side === "n" || o.side === "s";
        const half = o.width / 2;
        const x1 = horizontal ? o.x - half : o.x, x2 = horizontal ? o.x + half : o.x;
        const z1 = horizontal ? o.z : o.z - half, z2 = horizontal ? o.z : o.z + half;
        if (o.kind === "window") {
          return <g key={i} pointerEvents="none"><line x1={x1} y1={z1} x2={x2} y2={z2} stroke="#fff" strokeWidth={0.14} /><line x1={x1} y1={z1} x2={x2} y2={z2} stroke="#5aa0c8" strokeWidth={0.05} /></g>;
        }
        const gap = <line x1={x1} y1={z1} x2={x2} y2={z2} stroke={TYPE_TINT["Entrance & hallway"]} strokeWidth={0.16} />;
        if (o.kind === "opening") return <g key={i} pointerEvents="none">{gap}</g>;
        // Door swing: quarter arc from the hinge into the room.
        const into = o.side === "n" || o.side === "w" ? 1 : -1;
        const hx = x1, hz = z1;
        const leafEnd = horizontal ? { x: hx, z: hz + into * o.width } : { x: hx + into * o.width, z: hz };
        const arcEnd = { x: x2, z: z2 };
        const sweep = horizontal ? (into > 0 ? 0 : 1) : (into > 0 ? 1 : 0);
        return (
          <g key={i} pointerEvents="none">
            {gap}
            <line x1={hx} y1={hz} x2={leafEnd.x} y2={leafEnd.z} stroke={o.kind === "front-door" ? "#5a3b25" : "#2c2a27"} strokeWidth={o.kind === "front-door" ? 0.06 : 0.03} />
            <path d={`M${leafEnd.x} ${leafEnd.z} A${o.width} ${o.width} 0 0 ${sweep} ${arcEnd.x} ${arcEnd.z}`} fill="none" stroke="#2c2a27" strokeWidth={0.015} strokeDasharray="0.06 0.05" />
          </g>
        );
      })}
      {items.map((it) => (
        <g
          key={it.id}
          transform={`translate(${it.x} ${it.z}) rotate(${it.rotation})`}
          style={{ cursor: mode === "furniture" ? "grab" : "default" }}
          pointerEvents={mode === "furniture" ? "all" : "none"}
          onPointerDown={(e) => {
            if (mode !== "furniture") return;
            e.stopPropagation();
            (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
            const p = pt(e);
            drag.current = { kind: "item", id: it.id, dx: p.x - it.x, dz: p.z - it.z };
            onSelectItem?.(it.id);
          }}
        >
          <rect x={-it.w / 2} y={-it.d / 2} width={it.w} height={it.d} rx={0.04} fill={it.color} opacity={it.h <= 0.05 ? 0.45 : 0.9} stroke={it.id === selectedItemId ? "#c9a46a" : "rgba(0,0,0,.45)"} strokeWidth={it.id === selectedItemId ? 0.06 : 0.015} />
        </g>
      ))}
      {!compact && rooms.map((r) => {
        const f = Math.min(fs, r.width / 3.2, r.length / 6);
        return (
          <text key={`l-${r.id}`} x={r.x + 0.22} y={r.z + 0.22 + f} fontSize={f} fill="#2c2a27" pointerEvents="none" fontFamily="Inter, sans-serif"
            style={{ paintOrder: "stroke", stroke: "rgba(255,255,255,.85)", strokeWidth: f * 0.25 }}>
            <tspan fontWeight={600}>{r.name}</tspan>
            {r.width > 1.6 && <tspan x={r.x + 0.22} dy={f * 1.15} fontSize={f * 0.78} fill="#6b665f">{r.length}×{r.width} m · {(r.length * r.width).toFixed(1)} m²</tspan>}
          </text>
        );
      })}
    </svg>
  );
}
