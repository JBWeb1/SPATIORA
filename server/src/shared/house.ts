// Whole-house geometry, shared by the API (estimates) and the web client (3D + plan).
// Dependency-free on purpose. Coordinates are metres: x runs along a room's length,
// z along its width; (x, z) is a room's north-west corner.

export interface HouseRoom {
  id: string;
  name: string;
  type: string;          // one of ROOM_TYPES
  x: number;
  z: number;
  length: number;        // along x
  width: number;         // along z
  floor?: string | null; // material id override
  wall?: string | null;  // material id override
  ensuite?: boolean;     // bathroom reachable only from an adjoining bedroom
}

export interface HouseItem {
  id: string;
  roomId?: string;
  productId?: string;
  name: string;
  color: string;
  x: number; z: number; rotation: number;
  w: number; d: number; h: number;
}

export interface House {
  rooms: HouseRoom[];
  items: HouseItem[];
  height: number;
}

export type Side = "n" | "s" | "e" | "w";
export interface Opening { kind: "door" | "opening" | "window" | "front-door"; roomId: string; otherId?: string; side: Side; x: number; z: number; width: number; sill: number; head: number }
export interface WallSegment { roomId: string; side: Side; x1: number; z1: number; x2: number; z2: number; exterior: boolean }

const EPS = 0.05;
const LIVING_ZONE = new Set(["Living room", "Dining room", "Kitchen", "Entrance & hallway"]);
const isHall = (r: HouseRoom) => r.type === "Entrance & hallway";
export const isOutdoor = (r: HouseRoom) => r.type === "Patio & outdoor";

/** The four edges of a room as segments, with their outward side. */
export function edges(r: HouseRoom): { side: Side; x1: number; z1: number; x2: number; z2: number }[] {
  return [
    { side: "n", x1: r.x, z1: r.z, x2: r.x + r.length, z2: r.z },
    { side: "s", x1: r.x, z1: r.z + r.width, x2: r.x + r.length, z2: r.z + r.width },
    { side: "w", x1: r.x, z1: r.z, x2: r.x, z2: r.z + r.width },
    { side: "e", x1: r.x + r.length, z1: r.z, x2: r.x + r.length, z2: r.z + r.width },
  ];
}


/** Portion of edge `side` of room a that touches room b, as [from, to] along the edge axis. */
export function sharedSpan(a: HouseRoom, b: HouseRoom, side: Side): [number, number] | null {
  if (side === "n" || side === "s") {
    const za = side === "n" ? a.z : a.z + a.width;
    const zb = side === "n" ? b.z + b.width : b.z;
    if (Math.abs(za - zb) > EPS) return null;
    const from = Math.max(a.x, b.x), to = Math.min(a.x + a.length, b.x + b.length);
    return to - from > EPS ? [from, to] : null;
  }
  const xa = side === "w" ? a.x : a.x + a.length;
  const xb = side === "w" ? b.x + b.length : b.x;
  if (Math.abs(xa - xb) > EPS) return null;
  const from = Math.max(a.z, b.z), to = Math.min(a.z + a.width, b.z + b.width);
  return to - from > EPS ? [from, to] : null;
}

function wantsDoor(a: HouseRoom, b: HouseRoom): "door" | "opening" | null {
  if (isOutdoor(a) || isOutdoor(b)) return LIVING_ZONE.has(isOutdoor(a) ? b.type : a.type) ? "door" : null;
  const ens = (r: HouseRoom, o: HouseRoom) => r.ensuite && r.type === "Bathroom" && o.type !== "Bedroom";
  if (ens(a, b) || ens(b, a)) return null;
  if (isHall(a) || isHall(b)) return "door";
  if (a.type === "Bedroom" && b.type === "Bathroom" && b.ensuite) return "door";
  if (b.type === "Bedroom" && a.type === "Bathroom" && a.ensuite) return "door";
  if (LIVING_ZONE.has(a.type) && LIVING_ZONE.has(b.type)) return "opening";
  return null;
}

/** Work out interior doors/openings, exterior doors and windows for a set of rooms. */
export function openings(rooms: HouseRoom[]): Opening[] {
  const out: Opening[] = [];
  const connected = new Set<string>();
  const pairs: { a: HouseRoom; b: HouseRoom; side: Side; span: [number, number] }[] = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    for (const side of ["n", "s", "e", "w"] as Side[]) {
      const span = sharedSpan(rooms[i], rooms[j], side);
      if (span) pairs.push({ a: rooms[i], b: rooms[j], side, span });
    }
  }
  const place = (p: (typeof pairs)[number], kind: "door" | "opening") => {
    const len = p.span[1] - p.span[0];
    const width = kind === "opening" ? Math.min(2.4, Math.max(0.9, len - 0.6)) : Math.min(0.85, len - 0.2);
    if (width < 0.6) return;
    const mid = (p.span[0] + p.span[1]) / 2;
    const horizontal = p.side === "n" || p.side === "s";
    const line = p.side === "n" ? p.a.z : p.side === "s" ? p.a.z + p.a.width : p.side === "w" ? p.a.x : p.a.x + p.a.length;
    out.push({ kind, roomId: p.a.id, otherId: p.b.id, side: p.side, x: horizontal ? mid : line, z: horizontal ? line : mid, width, sill: 0, head: kind === "opening" ? 2.4 : 2.1 });
    connected.add(p.a.id); connected.add(p.b.id);
  };
  for (const p of pairs) {
    const k = wantsDoor(p.a, p.b);
    // An en-suite belongs to one bedroom only (the first one it adjoins in plan order).
    const ens = p.a.ensuite ? p.a : p.b.ensuite ? p.b : null;
    if (k && ens && connected.has(ens.id)) continue;
    if (k) place(p, k);
  }
  // Any indoor room still unreachable gets a door to its longest-shared neighbour.
  for (const r of rooms) {
    if (connected.has(r.id) || isOutdoor(r)) continue;
    const best = pairs.filter((p) => (p.a.id === r.id || p.b.id === r.id) && !isOutdoor(p.a) && !isOutdoor(p.b)).sort((x, y) => {
      // Prefer reaching living areas over walking through someone's bedroom.
      const zone = (p: (typeof pairs)[number]) => Number(LIVING_ZONE.has((p.a.id === r.id ? p.b : p.a).type));
      return zone(y) - zone(x) || (y.span[1] - y.span[0]) - (x.span[1] - x.span[0]);
    })[0];
    if (best) place(best, "door");
  }

  // Exterior: windows on outside walls, one front door.
  let frontPlaced = false;
  const frontRoom = rooms.find((r) => isHall(r)) ?? rooms.find((r) => r.type === "Living room") ?? rooms.find((r) => !isOutdoor(r));
  for (const r of rooms) {
    if (isOutdoor(r)) continue;
    for (const e of edges(r)) {
      for (const [from, to] of exteriorSpans(r, e.side, rooms)) {
        const len = to - from;
        const horizontal = e.side === "n" || e.side === "s";
        const at = (t: number) => (horizontal ? { x: t, z: e.z1 } : { x: e.x1, z: t });
        if (!frontPlaced && r.id === frontRoom?.id && len >= 1.0) {
          out.push({ kind: "front-door", roomId: r.id, side: e.side, ...at(from + Math.min(len / 2, 1.2)), width: 0.95, sill: 0, head: 2.1 });
          frontPlaced = true;
          if (len < 3.2) continue;
        }
        if (isHall(r) || len < 1.6) continue;
        const small = r.type === "Bathroom";
        const count = small ? 1 : Math.max(1, Math.floor(len / 3));
        for (let k = 0; k < count; k++) {
          const t = from + (len * (k + 1)) / (count + 1);
          if (out.some((o) => o.roomId === r.id && o.side === e.side && Math.abs((horizontal ? o.x : o.z) - t) < 1.2)) continue;
          out.push({ kind: "window", roomId: r.id, side: e.side, ...at(t), width: small ? 0.6 : Math.min(1.8, len / (count + 0.6)), sill: small ? 1.5 : 0.9, head: 2.1 });
        }
      }
    }
  }
  return out;
}

/** Parts of a room edge that face outside (not shared with another indoor room). */
export function exteriorSpans(r: HouseRoom, side: Side, rooms: HouseRoom[]): [number, number][] {
  const horizontal = side === "n" || side === "s";
  let spans: [number, number][] = [horizontal ? [r.x, r.x + r.length] : [r.z, r.z + r.width]];
  for (const o of rooms) {
    if (o.id === r.id || isOutdoor(o)) continue;
    const s = sharedSpan(r, o, side);
    if (!s) continue;
    spans = spans.flatMap(([a, b]) => {
      if (s[1] <= a || s[0] >= b) return [[a, b] as [number, number]];
      const parts: [number, number][] = [];
      if (s[0] > a + EPS) parts.push([a, s[0]]);
      if (s[1] < b - EPS) parts.push([s[1], b]);
      return parts;
    });
  }
  return spans;
}

/** Counts used by the renovation estimator for one room. */
export function roomOpeningCounts(room: HouseRoom, ops: Opening[]) {
  const mine = ops.filter((o) => o.roomId === room.id || o.otherId === room.id);
  return { doors: mine.filter((o) => o.kind === "door" || o.kind === "front-door").length, windows: mine.filter((o) => o.kind === "window").length };
}

export function houseBounds(rooms: HouseRoom[]) {
  if (!rooms.length) return { minX: 0, minZ: 0, maxX: 10, maxZ: 8 };
  return {
    minX: Math.min(...rooms.map((r) => r.x)), minZ: Math.min(...rooms.map((r) => r.z)),
    maxX: Math.max(...rooms.map((r) => r.x + r.length)), maxZ: Math.max(...rooms.map((r) => r.z + r.width)),
  };
}

export const floorArea = (rooms: HouseRoom[]) => rooms.filter((r) => !isOutdoor(r)).reduce((s, r) => s + r.length * r.width, 0);

/** Rooms that overlap each other (invalid plans). */
export function overlappingRooms(rooms: HouseRoom[]) {
  const bad: [HouseRoom, HouseRoom][] = [];
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    const w = Math.min(a.x + a.length, b.x + b.length) - Math.max(a.x, b.x);
    const d = Math.min(a.z + a.width, b.z + b.width) - Math.max(a.z, b.z);
    if (w > EPS && d > EPS) bad.push([a, b]);
  }
  return bad;
}
