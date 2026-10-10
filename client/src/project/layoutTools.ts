import type { LayoutItem, Product, Room } from "../types";
import { uid } from "../components/ui";

type Spec = { productId?: string; name?: string; color?: string; w?: number; d?: number; h?: number; place: (r: Room, it: { w: number; d: number }) => { x: number; z: number; rotation: number } };

const back = (r: Room, d: number, gap = 0.08) => -r.width / 2 + d / 2 + gap;   // against the window wall
const front = (r: Room, d: number, gap = 0.08) => r.width / 2 - d / 2 - gap;
const right = (r: Room, d: number, gap = 0.08) => r.length / 2 - d / 2 - gap;

// Footprint-aware starter layouts per room type. Positions follow common clearances
// (≈45cm sofa→coffee table, ≥90cm walkways) and are skipped if the room is too small.
const TEMPLATES: Record<string, Spec[]> = {
  "Living room": [
    { productId: "p-rug-wool", place: (r) => ({ x: 0, z: -r.width * 0.05, rotation: 0 }) },
    { productId: "p-sofa-linen", place: (r, it) => ({ x: 0, z: back(r, it.d), rotation: 0 }) },
    { productId: "p-coffee-travertine", place: (r, it) => ({ x: 0, z: back(r, 0.92) + 0.46 + 0.45 + it.d / 2, rotation: 0 }) },
    { productId: "p-armchair-teak", place: (r, it) => ({ x: right(r, it.d), z: 0, rotation: 270 }) },
    { name: "TV unit", color: "#3a3532", w: 1.8, d: 0.45, h: 0.5, place: (r, it) => ({ x: 0, z: front(r, it.d), rotation: 180 }) },
    { productId: "p-plant-fiddle", place: (r) => ({ x: r.length / 2 - 0.4, z: -r.width / 2 + 0.4, rotation: 0 }) },
  ],
  Bedroom: [
    { productId: "p-rug-jute", place: () => ({ x: 0, z: 0.2, rotation: 0 }) },
    { productId: "p-bed-queen", place: (r, it) => ({ x: 0, z: back(r, it.d, 0.05), rotation: 0 }) },
    { name: "Bedside table", color: "#b58c5d", w: 0.5, d: 0.4, h: 0.55, place: (r) => ({ x: -1.15, z: back(r, 0.4, 0.05), rotation: 0 }) },
    { name: "Bedside table", color: "#b58c5d", w: 0.5, d: 0.4, h: 0.55, place: (r) => ({ x: 1.15, z: back(r, 0.4, 0.05), rotation: 0 }) },
    { name: "Built-in cupboard", color: "#d9d2c5", w: 2.0, d: 0.6, h: 2.2, place: (r, it) => ({ x: right(r, it.d), z: 0.3, rotation: 90 }) },
  ],
  Kitchen: [
    { name: "Kitchen counter run", color: "#e8e4dc", w: 3.0, d: 0.6, h: 0.9, place: (r, it) => ({ x: 0, z: back(r, it.d, 0), rotation: 0 }) },
    { productId: "p-app-fridge", place: (r, it) => ({ x: r.length / 2 - it.w / 2 - 0.05, z: back(r, it.d, 0), rotation: 0 }) },
    { productId: "p-fix-island", place: (r) => ({ x: 0, z: back(r, 0.6, 0) + 0.3 + 1.1 + 0.5, rotation: 0 }) },
  ],
  Bathroom: [
    { productId: "p-fix-vanity", place: (r, it) => ({ x: -r.length * 0.15, z: back(r, it.d, 0), rotation: 0 }) },
    { productId: "p-fix-bath", place: (r, it) => ({ x: right(r, it.d, 0.02), z: 0, rotation: 90 }) },
    { name: "Toilet", color: "#f6f5f2", w: 0.38, d: 0.65, h: 0.8, place: (r) => ({ x: -r.length / 2 + 0.45, z: 0.4, rotation: 90 }) },
  ],
  "Dining room": [
    { productId: "p-rug-wool", place: () => ({ x: 0, z: 0, rotation: 0 }) },
    { productId: "p-dining-oak", place: () => ({ x: 0, z: 0, rotation: 0 }) },
    ...[-0.55, 0, 0.55].flatMap((x) => [
      { productId: "p-armchair-wishbone", place: () => ({ x, z: -0.75, rotation: 0 }) } as Spec,
      { productId: "p-armchair-wishbone", place: () => ({ x, z: 0.75, rotation: 180 }) } as Spec,
    ]),
    { productId: "p-sideboard-teak", place: (r, it) => ({ x: 0, z: front(r, it.d), rotation: 180 }) },
  ],
  "Home office": [
    { productId: "p-desk-walnut", place: (r, it) => ({ x: 0, z: back(r, it.d), rotation: 0 }) },
    { productId: "p-armchair-wishbone", place: (r) => ({ x: 0, z: back(r, 0.65) + 0.7, rotation: 180 }) },
    { productId: "p-shelf-steel", place: (r, it) => ({ x: right(r, it.d), z: 0.2, rotation: 270 }) },
    { productId: "p-plant-fiddle", place: (r) => ({ x: -r.length / 2 + 0.4, z: r.width / 2 - 0.4, rotation: 0 }) },
  ],
};

export function footprint(it: Pick<LayoutItem, "w" | "d" | "rotation">) {
  const r = ((it.rotation % 180) + 180) % 180;
  return r === 90 ? { w: it.d, d: it.w } : { w: it.w, d: it.d };
}

const box = (it: LayoutItem) => { const f = footprint(it); return { x1: it.x - f.w / 2, x2: it.x + f.w / 2, z1: it.z - f.d / 2, z2: it.z + f.d / 2 }; };
const isFlat = (it: LayoutItem) => it.h <= 0.05; // rugs etc. sit under furniture

/** Build a starter layout for the room type, using catalogue products where possible. */
export function autoFurnish(roomType: string, room: Room, products: Product[]): LayoutItem[] {
  const specs = TEMPLATES[roomType] ?? TEMPLATES["Living room"];
  const out: LayoutItem[] = [];
  for (const s of specs) {
    const p = s.productId ? products.find((x) => x.id === s.productId) : undefined;
    const size = p ? p.size : { w: s.w ?? 1, d: s.d ?? 1, h: s.h ?? 1 };
    const pos = s.place(room, size);
    const item: LayoutItem = { id: uid(), productId: p?.id, name: p?.name ?? s.name ?? "Item", color: p?.color ?? s.color ?? "#999999", ...size, ...pos };
    const b = box(item);
    const fits = b.x1 >= -room.length / 2 - 1e-6 && b.x2 <= room.length / 2 + 1e-6 && b.z1 >= -room.width / 2 - 1e-6 && b.z2 <= room.width / 2 + 1e-6;
    const collides = !isFlat(item) && (out.some((o) => !isFlat(o) && overlapArea(box(o), b) > 0.01) || doorZones(room).some((z) => overlapArea(z, b) > 0.01));
    // Self-check: leave out any piece that would create a clearance or daylight problem.
    const createsIssue = fits && !collides && checkLayout([...out, item], room).some((i) => i.level !== "info" && i.itemIds.includes(item.id));
    if (fits && !collides && !createsIssue) out.push(item);
  }
  return out;
}

/** 90 cm swing zones for doors on the left wall (matches the 3D view). */
function doorZones(room: Room) {
  return Array.from({ length: room.doors }, (_, d) => {
    const zc = -room.width / 2 + 1 + d * 1.4;
    return { x1: -room.length / 2, x2: -room.length / 2 + 0.9, z1: zc - 0.45, z2: zc + 0.45 };
  });
}

function overlapArea(a: ReturnType<typeof box>, b: ReturnType<typeof box>) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const d = Math.min(a.z2, b.z2) - Math.max(a.z1, b.z1);
  return w > 0 && d > 0 ? w * d : 0;
}

function gapBetween(a: ReturnType<typeof box>, b: ReturnType<typeof box>) {
  const dx = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
  const dz = Math.max(0, Math.max(a.z1, b.z1) - Math.min(a.z2, b.z2));
  return Math.hypot(dx, dz);
}

export interface LayoutIssue { level: "error" | "warn" | "info"; message: string; itemIds: string[] }

/** Check a layout for practical problems: collisions, tight walkways, blocked doors and windows, crowding. */
export function checkLayout(items: LayoutItem[], room: Room): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const solid = items.filter((i) => !isFlat(i));
  for (let i = 0; i < solid.length; i++) {
    for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j];
      const A = box(a), B = box(b);
      if (overlapArea(A, B) > 0.02) issues.push({ level: "error", message: `${a.name} overlaps ${b.name}`, itemIds: [a.id, b.id] });
      else {
        const gap = gapBetween(A, B);
        // Only walk-between pieces count: low tables beside sofas are meant to be within reach.
        const big = a.w * a.d > 0.6 && b.w * b.d > 0.6 && a.h >= 0.6 && b.h >= 0.6;
        if (big && gap > 0.05 && gap < 0.6) issues.push({ level: "warn", message: `Only ${Math.round(gap * 100)} cm between ${a.name} and ${b.name} — aim for 60–90 cm to walk through`, itemIds: [a.id, b.id] });
      }
    }
  }
  // Doors are on the left wall (matches the 3D view): keep a 90 cm swing zone clear.
  doorZones(room).forEach((zone, d) => {
    for (const it of solid) if (overlapArea(box(it), zone) > 0.01) issues.push({ level: "error", message: `${it.name} blocks door ${d + 1} — keep 90 cm clear for the door swing`, itemIds: [it.id] });
  });
  // Tall items directly in front of windows on the back wall.
  for (let w = 0; w < room.windows; w++) {
    const cx = -room.length / 2 + room.length * ((w + 1) / (room.windows + 1));
    const half = Math.min(1.4, (room.length / (room.windows + 1)) * 0.8) / 2;
    const zone = { x1: cx - half, x2: cx + half, z1: -room.width / 2, z2: -room.width / 2 + 0.5 };
    for (const it of solid) if (it.h > 1.2 && overlapArea(box(it), zone) > 0.01) issues.push({ level: "warn", message: `${it.name} stands in front of window ${w + 1} and blocks natural light`, itemIds: [it.id] });
  }
  for (const it of items) {
    const b = box(it);
    if (b.x1 < -room.length / 2 - 0.01 || b.x2 > room.length / 2 + 0.01 || b.z1 < -room.width / 2 - 0.01 || b.z2 > room.width / 2 + 0.01) issues.push({ level: "error", message: `${it.name} doesn't fit inside the room`, itemIds: [it.id] });
  }
  const area = room.length * room.width;
  const used = solid.reduce((s, i) => s + i.w * i.d, 0) / area;
  if (used > 0.45) issues.push({ level: "warn", message: `Furniture covers ${Math.round(used * 100)}% of the floor — the room will feel crowded (aim for under 40%)`, itemIds: [] });
  else if (items.length > 0 && used < 0.08 && area > 9) issues.push({ level: "info", message: "The room looks sparse — a rug or a larger piece would anchor the space", itemIds: [] });
  return issues;
}
