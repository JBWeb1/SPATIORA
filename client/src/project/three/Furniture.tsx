import { useMemo, type ReactNode } from "react";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import type { LayoutItem } from "../../types";
import { surfaceTexture } from "./textures";

// Realistic-looking furniture built from primitives and sized to each product's real
// dimensions. Every model sits on the floor at the origin and faces +z (its "front").

export type ModelKind =
  | "sofa" | "armchair" | "chair" | "coffee-table" | "table" | "desk" | "bed" | "bedside" | "rug" | "tv-unit"
  | "cabinet" | "wardrobe" | "shelf" | "plant" | "pendant" | "chandelier" | "lamp" | "downlight" | "island" | "counter"
  | "fridge" | "oven" | "hob" | "box" | "basin" | "vanity" | "shower" | "bath" | "toilet" | "sink" | "panel" | "wall-decor";

const BY_PRODUCT: Record<string, ModelKind> = {
  "p-sofa-boucle": "sofa", "p-sofa-leather": "sofa", "p-sofa-linen": "sofa",
  "p-armchair-teak": "armchair", "p-armchair-wishbone": "chair",
  "p-coffee-travertine": "coffee-table", "p-coffee-reclaimed": "coffee-table",
  "p-dining-oak": "table", "p-desk-walnut": "desk",
  "p-bed-queen": "bed", "p-bed-platform": "bed",
  "p-sideboard-teak": "cabinet", "p-shelf-steel": "shelf",
  "p-rug-jute": "rug", "p-rug-wool": "rug", "p-basket-set": "wall-decor", "p-plant-fiddle": "plant",
  "p-light-chandelier": "chandelier", "p-light-paper": "pendant", "p-light-edison": "pendant", "p-light-led-down": "downlight", "p-light-rechargeable": "lamp",
  "p-app-gashob": "hob", "p-app-oven": "oven", "p-app-fridge": "fridge", "p-app-gasgeyser": "box",
  "p-fix-basin": "basin", "p-fix-vanity": "vanity", "p-fix-shower": "shower", "p-fix-bath": "bath", "p-fix-sink": "sink", "p-fix-island": "island",
  "p-en-inverter": "box", "p-en-battery": "box", "p-en-panel": "panel",
};

export function modelKind(item: Pick<LayoutItem, "productId" | "name">): ModelKind {
  if (item.productId && BY_PRODUCT[item.productId]) return BY_PRODUCT[item.productId];
  const n = item.name.toLowerCase();
  const rules: [RegExp, ModelKind][] = [
    [/sofa|couch|chesterfield/, "sofa"], [/armchair|lounge chair/, "armchair"], [/chair|stool/, "chair"],
    [/coffee table/, "coffee-table"], [/desk/, "desk"], [/table/, "table"], [/bedside|nightstand/, "bedside"], [/bed/, "bed"],
    [/rug|runner/, "rug"], [/tv/, "tv-unit"], [/wardrobe|cupboard|built-in/, "wardrobe"], [/sideboard|cabinet|storage/, "cabinet"],
    [/shel/, "shelf"], [/plant|tree/, "plant"], [/chandelier/, "chandelier"], [/pendant|lantern/, "pendant"], [/lamp/, "lamp"],
    [/island/, "island"], [/counter|kitchen/, "counter"], [/fridge/, "fridge"], [/oven/, "oven"], [/hob/, "hob"],
    [/vanity/, "vanity"], [/basin/, "basin"], [/shower/, "shower"], [/bath/, "bath"], [/toilet|wc/, "toilet"], [/sink/, "sink"],
  ];
  return rules.find(([re]) => re.test(n))?.[1] ?? "box";
}

/** Height above the floor the model is mounted at (wall/ceiling/counter items). */
export function mountHeight(kind: ModelKind, item: { h: number }, ceiling: number) {
  if (kind === "pendant" || kind === "chandelier") return Math.max(1.9, ceiling - item.h - 0.45);
  if (kind === "downlight") return ceiling - item.h;
  if (kind === "basin" || kind === "sink") return 0.86 - item.h * 0.5;
  if (kind === "hob") return 0.9;
  if (kind === "wall-decor") return 1.3;
  if (kind === "lamp") return 0;
  return 0;
}

const WOOD_DARK = "#4a3221";
const METAL = "#2b2b2b";
const WHITE = "#f4f2ee";

const darker = (c: string, k = 0.75) => `#${new THREE.Color(c).multiplyScalar(k).getHexString()}`;
const lighter = (c: string, k = 0.25) => `#${new THREE.Color(c).lerp(new THREE.Color("#ffffff"), k).getHexString()}`;

function useFabric(color: string, w: number, h: number) {
  return useMemo(() => surfaceTexture("fabric", color, w, h, 0.6), [color, w, h]);
}

const Box = ({ p, s, c, r = 0.7, m = 0, map, children }: { p: [number, number, number]; s: [number, number, number]; c: string; r?: number; m?: number; map?: THREE.Texture; children?: ReactNode }) => (
  <mesh position={p} castShadow receiveShadow>
    <boxGeometry args={s} />
    <meshStandardMaterial color={c} roughness={r} metalness={m} map={map} />
    {children}
  </mesh>
);
const Soft = ({ p, s, c, radius = 0.05, map }: { p: [number, number, number]; s: [number, number, number]; c: string; radius?: number; map?: THREE.Texture }) => (
  <RoundedBox args={s} radius={Math.min(radius, Math.min(...s) / 2 - 0.001)} smoothness={3} position={p} castShadow receiveShadow>
    <meshStandardMaterial color={c} roughness={0.95} map={map} />
  </RoundedBox>
);
const Cyl = ({ p, r1, r2 = r1, h, c, rough = 0.6, metal = 0, seg = 20, rot }: { p: [number, number, number]; r1: number; r2?: number; h: number; c: string; rough?: number; metal?: number; seg?: number; rot?: [number, number, number] }) => (
  <mesh position={p} rotation={rot} castShadow receiveShadow>
    <cylinderGeometry args={[r1, r2, h, seg]} />
    <meshStandardMaterial color={c} roughness={rough} metalness={metal} />
  </mesh>
);
const Legs = ({ w, d, h, c = WOOD_DARK, inset = 0.06, r = 0.022 }: { w: number; d: number; h: number; c?: string; inset?: number; r?: number }) => (
  <>{[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => <Cyl key={i} p={[sx * (w / 2 - inset), h / 2, sz * (d / 2 - inset)]} r1={r} r2={r * 0.75} h={h} c={c} />)}</>
);
const Glow = ({ p, r, c = "#fff4dc" }: { p: [number, number, number]; r: number; c?: string }) => (
  <mesh position={p}><sphereGeometry args={[r, 16, 12]} /><meshStandardMaterial color={c} emissive={c} emissiveIntensity={1.4} /></mesh>
);

function Sofa({ w, d, h, c, single = false }: { w: number; d: number; h: number; c: string; single?: boolean }) {
  const fab = useFabric(c, w, d);
  const arm = Math.min(0.2, w * 0.12);
  const legH = 0.1;
  const seatY = legH + h * 0.2;
  const inner = w - arm * 2;
  const n = single ? 1 : inner > 1.7 ? 3 : 2;
  const cw = inner / n;
  return (
    <group>
      <Legs w={w} d={d} h={legH} inset={0.08} />
      <Soft p={[0, seatY, 0]} s={[w, h * 0.3, d]} c={darker(c, 0.92)} map={fab} radius={0.04} />
      {[-1, 1].map((sx) => <Soft key={sx} p={[sx * (w / 2 - arm / 2), legH + h * 0.36, 0]} s={[arm, h * 0.55, d]} c={c} map={fab} radius={0.06} />)}
      <Soft p={[0, legH + h * 0.55, -d / 2 + d * 0.13]} s={[w - 0.02, h * 0.75, d * 0.26]} c={c} map={fab} radius={0.07} />
      {Array.from({ length: n }, (_, i) => (
        <group key={i} position={[-inner / 2 + cw * (i + 0.5), 0, 0]}>
          <Soft p={[0, seatY + h * 0.2, d * 0.1]} s={[cw - 0.025, h * 0.16, d * 0.68]} c={lighter(c, 0.06)} map={fab} radius={0.06} />
          <Soft p={[0, legH + h * 0.66, -d / 2 + d * 0.3]} s={[cw - 0.04, h * 0.5, d * 0.17]} c={lighter(c, 0.06)} map={fab} radius={0.07} />
        </group>
      ))}
      {!single && <Soft p={[-inner / 2 + 0.25, seatY + h * 0.42, -d * 0.12]} s={[0.42, 0.38, 0.12]} c={lighter(c, 0.35)} radius={0.06} />}
    </group>
  );
}

function Bed({ w, d, h, c }: { w: number; d: number; h: number; c: string }) {
  const fab = useFabric(c, w, d);
  const low = h < 0.6;
  const frameH = low ? Math.min(0.22, h * 0.6) : 0.3;
  const headH = low ? Math.max(h, 0.5) : h;
  return (
    <group>
      <Box p={[0, frameH / 2, 0]} s={[w, frameH, d]} c={low ? c : darker(c, 0.85)} map={low ? undefined : fab} />
      <Soft p={[0, frameH + 0.11, 0.04]} s={[w - 0.08, 0.22, d - 0.12]} c={WHITE} radius={0.06} />
      <Soft p={[0, frameH + 0.24, d * 0.13]} s={[w - 0.02, 0.07, d * 0.62]} c={lighter(c, 0.45)} radius={0.03} />
      <Soft p={[0, frameH + 0.245, d * 0.42]} s={[w + 0.01, 0.06, d * 0.14]} c={darker(lighter(c, 0.2), 0.9)} radius={0.03} />
      {[-1, 1].map((sx) => <Soft key={sx} p={[sx * w * 0.24, frameH + 0.3, -d / 2 + 0.3]} s={[w * 0.4, 0.13, 0.36]} c="#fbfaf7" radius={0.06} />)}
      <Soft p={[0, headH / 2, -d / 2 + 0.05]} s={[w + 0.06, headH, 0.1]} c={c} map={low ? undefined : fab} radius={0.04} />
    </group>
  );
}

function Plant({ w, h, c }: { w: number; h: number; c: string }) {
  const leaves = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const a = (i / 9) * Math.PI * 2;
    const t = 0.55 + (i % 3) * 0.12;
    return { p: [Math.cos(a) * w * 0.22, h * t, Math.sin(a) * w * 0.22] as [number, number, number], r: w * (0.2 + (i % 2) * 0.06) };
  }), [w, h]);
  return (
    <group>
      <Cyl p={[0, h * 0.12, 0]} r1={w * 0.32} r2={w * 0.25} h={h * 0.24} c="#d9d2c6" rough={0.8} />
      <Cyl p={[0, h * 0.4, 0]} r1={0.02} h={h * 0.4} c="#5b4630" />
      {leaves.map((l, i) => <mesh key={i} position={l.p} castShadow><sphereGeometry args={[l.r, 12, 10]} /><meshStandardMaterial color={i % 2 ? c : darker(c, 0.8)} roughness={0.85} /></mesh>)}
      <mesh position={[0, h * 0.86, 0]} castShadow><sphereGeometry args={[w * 0.24, 12, 10]} /><meshStandardMaterial color={lighter(c, 0.1)} roughness={0.85} /></mesh>
    </group>
  );
}

function Counter({ w, d, h, c, top = "#ece9e4", wallUnits = true }: { w: number; d: number; h: number; c: string; top?: string; wallUnits?: boolean }) {
  const n = Math.max(2, Math.round(w / 0.6));
  const topTex = useMemo(() => surfaceTexture("marble", top, w, d, 1.2), [top, w, d]);
  return (
    <group>
      <Box p={[0, 0.05, 0.02]} s={[w, 0.1, d - 0.06]} c="#222" />
      <Box p={[0, (h - 0.04) / 2 + 0.05, 0]} s={[w, h - 0.14, d]} c={c} r={0.45} />
      {Array.from({ length: n }, (_, i) => {
        const x = -w / 2 + (w / n) * (i + 0.5);
        return (
          <group key={i}>
            <Box p={[x - w / n / 2, h / 2, d / 2 + 0.002]} s={[0.006, h - 0.15, 0.004]} c={darker(c, 0.7)} />
            <Box p={[x, h - 0.16, d / 2 + 0.02]} s={[Math.min(0.3, w / n - 0.15), 0.015, 0.02]} c={METAL} m={0.8} r={0.3} />
          </group>
        );
      })}
      <Box p={[0, h - 0.02, 0.01]} s={[w + 0.02, 0.04, d + 0.03]} c={top} r={0.2} map={topTex} />
      {wallUnits && (
        <>
          <Box p={[0, h + 0.3, -d / 2 + 0.01]} s={[w, 0.6, 0.015]} c={lighter(top, 0.1)} r={0.15} />
          <Box p={[0, h + 0.95, -d / 2 + 0.18]} s={[w, 0.7, 0.34]} c={c} r={0.45} />
          {Array.from({ length: n }, (_, i) => <Box key={i} p={[-w / 2 + (w / n) * i, h + 0.95, -d / 2 + 0.355]} s={[0.006, 0.68, 0.004]} c={darker(c, 0.7)} />)}
        </>
      )}
      <Box p={[-w * 0.22, h + 0.002, 0.02]} s={[0.55, 0.01, 0.45]} c="#1b1b1b" r={0.15} />
      {[[-0.12, -0.1], [0.12, -0.1], [-0.12, 0.12], [0.12, 0.12]].map(([x, z], i) => (
        <mesh key={i} position={[-w * 0.22 + x, h + 0.012, 0.02 + z]} rotation-x={Math.PI / 2}><torusGeometry args={[0.05, 0.008, 6, 20]} /><meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} /></mesh>
      ))}
      <Box p={[w * 0.22, h - 0.05, 0.02]} s={[0.55, 0.1, 0.4]} c="#cfd3d6" m={0.7} r={0.25} />
      <Cyl p={[w * 0.22, h + 0.15, -0.18]} r1={0.012} h={0.3} c="#b8bcc0" metal={0.9} rough={0.2} />
    </group>
  );
}

function Model({ kind, w, d, h, c, ceiling }: { kind: ModelKind; w: number; d: number; h: number; c: string; ceiling: number }) {
  const fab = useFabric(c, w, d);
  switch (kind) {
    case "sofa": return <Sofa w={w} d={d} h={h} c={c} />;
    case "armchair": return <Sofa w={w} d={d} h={h} c={c} single />;
    case "bed": return <Bed w={w} d={d} h={h} c={c} />;
    case "plant": return <Plant w={w} h={h} c={c} />;
    case "chair":
      return (
        <group>
          <Legs w={w * 0.9} d={d * 0.9} h={0.44} c={c} r={0.016} />
          <Box p={[0, 0.455, 0]} s={[w * 0.92, 0.035, d * 0.9]} c={c} />
          <Soft p={[0, 0.48, 0.01]} s={[w * 0.82, 0.03, d * 0.78]} c="#d8cdb8" radius={0.012} />
          <Box p={[0, 0.72, -d * 0.42]} s={[w * 0.9, 0.06, 0.03]} c={c} />
          {[-1, 1].map((sx) => <Box key={sx} p={[sx * w * 0.42, 0.62, -d * 0.42]} s={[0.025, 0.32, 0.025]} c={c} />)}
        </group>
      );
    case "coffee-table":
      return (
        <group>
          <Soft p={[0, h - 0.035, 0]} s={[w, 0.07, d]} c={c} radius={0.02} />
          <Box p={[-w * 0.28, (h - 0.07) / 2, 0]} s={[w * 0.12, h - 0.07, d * 0.7]} c={darker(c, 0.9)} />
          <Box p={[w * 0.28, (h - 0.07) / 2, 0]} s={[w * 0.12, h - 0.07, d * 0.7]} c={darker(c, 0.9)} />
          <Cyl p={[w * 0.2, h + 0.06, 0]} r1={0.06} r2={0.05} h={0.12} c="#e9e4da" />
        </group>
      );
    case "table":
    case "desk":
      return (
        <group>
          <Box p={[0, h - 0.02, 0]} s={[w, 0.04, d]} c={c} r={0.5} />
          <Legs w={w} d={d} h={h - 0.04} c={darker(c, 0.85)} inset={0.08} r={0.03} />
          {kind === "desk" && <Box p={[w * 0.28, h - 0.12, 0]} s={[w * 0.36, 0.12, d * 0.9]} c={darker(c, 0.95)} />}
          {kind === "desk" && <Box p={[-w * 0.15, h + 0.17, -d * 0.2]} s={[0.55, 0.32, 0.02]} c="#1a1a1a" r={0.2} />}
          {kind === "table" && <Cyl p={[0, h + 0.08, 0]} r1={0.1} r2={0.07} h={0.16} c="#e7e1d5" />}
        </group>
      );
    case "bedside":
      return (
        <group>
          <Box p={[0, h / 2, 0]} s={[w, h, d]} c={c} />
          <Box p={[0, h * 0.62, d / 2 + 0.003]} s={[w * 0.85, 0.005, 0.004]} c={darker(c, 0.6)} />
          <Cyl p={[0, h + 0.1, 0]} r1={0.06} r2={0.08} h={0.2} c="#e8e0d0" />
          <Cyl p={[0, h + 0.26, 0]} r1={0.09} r2={0.14} h={0.14} c="#f5efe2" />
        </group>
      );
    case "rug":
      return (
        <group>
          <mesh position={[0, 0.006, 0]} receiveShadow><boxGeometry args={[w, 0.012, d]} /><meshStandardMaterial color={c} roughness={1} map={surfaceTexture("carpet", c, w, d, 0.8)} /></mesh>
          <mesh position={[0, 0.0125, 0]} receiveShadow><boxGeometry args={[w * 0.86, 0.002, d * 0.8]} /><meshStandardMaterial color={lighter(c, 0.18)} roughness={1} map={surfaceTexture("carpet", lighter(c, 0.18), w, d, 0.8)} /></mesh>
        </group>
      );
    case "tv-unit":
      return (
        <group>
          <Box p={[0, h / 2 + 0.05, 0]} s={[w, h - 0.1, d]} c={c} />
          <Legs w={w} d={d} h={0.1} c={METAL} r={0.015} />
          {[-1, 0, 1].map((i) => <Box key={i} p={[i * w / 3, h / 2 + 0.05, d / 2 + 0.003]} s={[0.004, h - 0.14, 0.004]} c={darker(c, 0.6)} />)}
          <Box p={[0, h + 0.38, -d * 0.15]} s={[Math.min(1.45, w * 0.8), 0.82, 0.04]} c="#0d0d0f" r={0.15} m={0.3} />
          <Box p={[0, h + 0.02, -d * 0.15]} s={[0.3, 0.03, 0.2]} c={METAL} m={0.7} />
        </group>
      );
    case "cabinet":
    case "wardrobe": {
      const doors = Math.max(2, Math.round(w / (kind === "wardrobe" ? 0.5 : 0.45)));
      const legH = kind === "cabinet" ? 0.12 : 0;
      return (
        <group>
          {legH > 0 && <Legs w={w} d={d} h={legH} c={darker(c, 0.6)} r={0.018} />}
          <Box p={[0, legH + (h - legH) / 2, 0]} s={[w, h - legH, d]} c={c} r={0.55} />
          {Array.from({ length: doors }, (_, i) => {
            const x = -w / 2 + (w / doors) * (i + 0.5);
            return (
              <group key={i}>
                {i > 0 && <Box p={[-w / 2 + (w / doors) * i, legH + (h - legH) / 2, d / 2 + 0.002]} s={[0.006, h - legH - 0.04, 0.004]} c={darker(c, 0.65)} />}
                <Box p={[x + (i % 2 ? -1 : 1) * (w / doors / 2 - 0.05), legH + (h - legH) * (kind === "wardrobe" ? 0.5 : 0.62), d / 2 + 0.015]} s={[0.015, kind === "wardrobe" ? 0.3 : 0.12, 0.02]} c={kind === "wardrobe" ? METAL : "#b08d57"} m={0.8} r={0.3} />
              </group>
            );
          })}
        </group>
      );
    }
    case "shelf":
      return (
        <group>
          {[-1, 1].map((sx) => <Box key={sx} p={[sx * (w / 2 - 0.015), h / 2, 0]} s={[0.03, h, d]} c={c} m={0.6} r={0.4} />)}
          {Array.from({ length: 5 }, (_, i) => <Box key={i} p={[0, 0.08 + (i * (h - 0.1)) / 4, 0]} s={[w, 0.025, d]} c={i % 2 ? "#8a6a4a" : "#7a5c3e"} />)}
          {Array.from({ length: 4 }, (_, i) => (
            <group key={i} position={[-w * 0.3 + (i % 2) * w * 0.35, 0.08 + ((i + 1) * (h - 0.1)) / 4 - (h - 0.1) / 4 + 0.13, 0]}>
              {[0, 1, 2, 3].map((b) => <Box key={b} p={[b * 0.05, 0, 0]} s={[0.04, 0.22 - (b % 2) * 0.03, d * 0.7]} c={["#7b2f2f", "#2f4b6b", "#c8b28a", "#3f5f3f"][(b + i) % 4]} />)}
            </group>
          ))}
        </group>
      );
    case "pendant":
    case "chandelier": {
      const cord = Math.max(0.1, ceiling - h);
      return (
        <group>
          <Cyl p={[0, h + cord / 2, 0]} r1={0.004} h={cord} c="#222" />
          {kind === "chandelier" ? (
            <>
              {[0, 1, 2].map((t) => <mesh key={t} position={[0, h * (0.25 + t * 0.3), 0]}><torusGeometry args={[w * (0.45 - t * 0.12), 0.012, 8, 32]} /><meshStandardMaterial color="#b08d57" metalness={0.9} roughness={0.25} /></mesh>)}
              {Array.from({ length: 8 }, (_, i) => <Glow key={i} p={[Math.cos((i / 8) * Math.PI * 2) * w * 0.4, h * 0.3, Math.sin((i / 8) * Math.PI * 2) * w * 0.4]} r={0.035} />)}
            </>
          ) : (
            <>
              <mesh position={[0, h * 0.5, 0]}><sphereGeometry args={[Math.min(w, 0.6) * 0.5, 24, 16]} /><meshStandardMaterial color={c} emissive="#ffe8c2" emissiveIntensity={0.55} roughness={0.9} transparent opacity={0.95} /></mesh>
            </>
          )}
        </group>
      );
    }
    case "downlight":
      return <Cyl p={[0, h, 0]} r1={0.05} h={0.01} c="#fff8e8" />;
    case "lamp":
      return (
        <group>
          <Cyl p={[0, 0.02, 0]} r1={w * 0.35} h={0.04} c="#3a3a3a" />
          <Cyl p={[0, h * 0.4, 0]} r1={0.01} h={h * 0.75} c="#3a3a3a" />
          <Cyl p={[0, h * 0.85, 0]} r1={w * 0.3} r2={w * 0.45} h={h * 0.3} c={c} />
          <Glow p={[0, h * 0.8, 0]} r={0.03} />
        </group>
      );
    case "island": return <Counter w={w} d={d} h={h} c={c} top="#f1eee8" wallUnits={false} />;
    case "counter": return <Counter w={w} d={d} h={h} c={c} />;
    case "fridge":
      return (
        <group>
          <Soft p={[0, h / 2, 0]} s={[w, h, d]} c={c} radius={0.03} />
          <Box p={[0, h * 0.62, d / 2 + 0.002]} s={[w, 0.006, 0.004]} c="#888" />
          <Box p={[w * 0.38, h * 0.78, d / 2 + 0.03]} s={[0.02, 0.35, 0.03]} c="#9aa0a6" m={0.9} r={0.2} />
          <Box p={[w * 0.38, h * 0.42, d / 2 + 0.03]} s={[0.02, 0.35, 0.03]} c="#9aa0a6" m={0.9} r={0.2} />
        </group>
      );
    case "oven":
      return (
        <group>
          <Box p={[0, h / 2, 0]} s={[w, h, d]} c="#2a2a2a" />
          <Box p={[0, h * 0.42, d / 2 + 0.003]} s={[w * 0.85, h * 0.55, 0.004]} c="#0a0a0c" r={0.05} m={0.3} />
          <Box p={[0, h * 0.82, d / 2 + 0.02]} s={[w * 0.7, 0.02, 0.02]} c="#aaa" m={0.9} />
        </group>
      );
    case "hob":
      return (
        <group>
          <Box p={[0, 0.01, 0]} s={[w, 0.02, d]} c="#151515" r={0.1} />
          {[[-0.3, -0.12], [0, -0.12], [0.3, -0.12], [-0.15, 0.12], [0.15, 0.12]].map(([x, z], i) => (
            <mesh key={i} position={[x * w, 0.025, z]} rotation-x={Math.PI / 2}><torusGeometry args={[0.055, 0.01, 6, 20]} /><meshStandardMaterial color="#666" metalness={0.8} /></mesh>
          ))}
        </group>
      );
    case "vanity":
      return (
        <group>
          <Box p={[0, 0.65, 0]} s={[w, 0.4, d]} c={c} />
          <Box p={[0, 0.65, d / 2 + 0.003]} s={[0.006, 0.36, 0.004]} c={darker(c, 0.6)} />
          <Box p={[0, 0.86, 0]} s={[w + 0.02, 0.03, d + 0.02]} c={WHITE} r={0.25} />
          <Cyl p={[0, 0.93, 0.03]} r1={0.2} r2={0.16} h={0.12} c={WHITE} rough={0.15} />
          <Cyl p={[0, 1.0, -d / 2 + 0.08]} r1={0.012} h={0.2} c="#c0c4c8" metal={0.9} rough={0.2} />
          <Box p={[0, 1.55, -d / 2 + 0.01]} s={[w * 0.85, 0.75, 0.02]} c="#cfe0e6" r={0.02} m={0.9} />
        </group>
      );
    case "basin":
      return <Cyl p={[0, h / 2, 0]} r1={w * 0.45} r2={w * 0.35} h={h} c={WHITE} rough={0.15} />;
    case "sink":
      return <Box p={[0, h / 2, 0]} s={[w, h, d]} c={c} r={0.2} />;
    case "shower":
      return (
        <group>
          <Box p={[0, 0.03, 0]} s={[0.9, 0.06, 0.9]} c={WHITE} r={0.2} />
          <mesh position={[0.45, 1.0, 0]}><boxGeometry args={[0.01, 2.0, 0.9]} /><meshPhysicalMaterial color="#dfeff3" transparent opacity={0.25} roughness={0.05} /></mesh>
          <Cyl p={[-0.3, 1.1, -0.42]} r1={0.012} h={2.0} c={c} metal={0.7} />
          <Cyl p={[-0.3, 2.05, -0.3]} r1={0.12} h={0.02} c={c} metal={0.7} />
        </group>
      );
    case "bath":
      return (
        <group>
          <Soft p={[0, h / 2, 0]} s={[w, h, d]} c={c} radius={0.12} />
          <mesh position={[0, h - 0.04, 0]}><boxGeometry args={[w - 0.16, 0.05, d - 0.14]} /><meshStandardMaterial color="#dfe9ec" roughness={0.1} /></mesh>
          <Cyl p={[w / 2 - 0.12, h + 0.12, 0]} r1={0.012} h={0.25} c="#c0c4c8" metal={0.9} rough={0.2} />
        </group>
      );
    case "toilet":
      return (
        <group>
          <Cyl p={[0, 0.2, d * 0.1]} r1={0.18} r2={0.14} h={0.4} c={c} rough={0.15} />
          <Box p={[0, 0.42, d * 0.1]} s={[0.38, 0.03, 0.45]} c={c} r={0.15} />
          <Box p={[0, 0.6, -d / 2 + 0.1]} s={[0.38, 0.38, 0.17]} c={c} r={0.15} />
        </group>
      );
    case "panel":
      return <Box p={[0, h / 2, 0]} s={[w, h, d]} c={c} r={0.15} m={0.4} />;
    case "wall-decor":
      return <group>{[-0.35, 0, 0.35].map((x, i) => <Cyl key={i} p={[x * w, 0.25 + (i % 2) * 0.1, 0]} r1={0.16 + i * 0.03} h={0.03} c={i % 2 ? c : darker(c, 0.85)} rot={[Math.PI / 2, 0, 0]} />)}</group>;
    default:
      return <Soft p={[0, h / 2, 0]} s={[w, h, d]} c={c} radius={0.02} map={kind === "box" ? undefined : fab} />;
  }
}

export function FurnitureModel({ item, ceiling = 2.7, selected = false }: { item: LayoutItem; ceiling?: number; selected?: boolean }) {
  const kind = modelKind(item);
  const y = mountHeight(kind, item, ceiling);
  return (
    <group>
      <group position={[0, y, 0]}>
        <Model kind={kind} w={item.w} d={item.d} h={item.h} c={item.color} ceiling={ceiling - y} />
      </group>
      {selected && (
        <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
          <ringGeometry args={[Math.max(item.w, item.d) * 0.55, Math.max(item.w, item.d) * 0.55 + 0.04, 48]} />
          <meshBasicMaterial color="#c9a46a" />
        </mesh>
      )}
    </group>
  );
}
