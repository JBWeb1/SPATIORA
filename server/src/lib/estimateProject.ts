import { estimate, type EstimateLine, type EstimateOptions, type Finishes } from "../services/estimator.js";
import { isOutdoor, openings, roomOpeningCounts, type House } from "../shared/house.js";
import type { serializeProject } from "./projects.js";

type SP = ReturnType<typeof serializeProject>;
type Result = ReturnType<typeof estimate> & { rooms?: { id: string; name: string; type: string; area: number; total: number }[] };

/** Project-level finishes as the estimator expects them. */
export function finishesOf(sp: SP): Finishes {
  const f = sp.finishes as Record<string, string | number | undefined>;
  return {
    flooring: f.flooring as string, wall: f.wall as string, ceiling: f.ceiling as string, tiles: f.tiles as string,
    tiledArea: Number(f.tiledArea ?? 0), countertop: f.countertop as string, countertopLength: Number(f.countertopLength ?? 0),
    cabinetry: f.cabinetry as string, cabinetryLength: Number(f.cabinetryLength ?? 0),
  };
}

/** Estimate a whole house: each room with its own size, openings and finish overrides. */
export function estimateHouse(house: House, finishes: Finishes, opts: EstimateOptions): Result {
  const ops = openings(house.rooms);
  const lines: EstimateLine[] = [];
  const quantities: Result["quantities"] = [];
  const rooms: NonNullable<Result["rooms"]> = [];
  const totals = { materials: 0, labour: 0, services: 0, subtotal: 0, contingency: 0, vat: 0, total: 0 };
  const geometry = { floorArea: 0, perimeter: 0, wallArea: 0, ceilingArea: 0 };
  const range = { low: 0, high: 0 };
  let first = true;

  for (const r of house.rooms) {
    const counts = roomOpeningCounts(r, ops);
    const spec = { length: r.length, width: r.width, height: house.height, doors: counts.doors, windows: counts.windows };
    const outdoor = isOutdoor(r);
    const wet = r.type === "Bathroom";
    const f: Finishes = outdoor
      ? { flooring: r.floor ?? "floor-porcelain" }
      : {
          flooring: r.floor ?? finishes.flooring, wall: r.wall ?? finishes.wall, ceiling: finishes.ceiling,
          ...(r.type === "Kitchen" ? { tiles: finishes.tiles, tiledArea: finishes.tiledArea || 3, countertop: finishes.countertop, countertopLength: finishes.countertopLength || 3, cabinetry: finishes.cabinetry, cabinetryLength: finishes.cabinetryLength || 4 } : {}),
          ...(wet ? { tiles: finishes.tiles ?? "tiles-subway", tiledArea: Math.round((r.length + r.width) * 2 * 1.2) } : {}),
        };
    const roomOpts: EstimateOptions = { ...opts, electricalPoints: first ? opts.electricalPoints : 0, plumbingPoints: first ? opts.plumbingPoints : 0 };
    first = false;
    const e = estimate(spec, f, roomOpts);
    lines.push(...e.lines.map((l) => ({ ...l, item: `${r.name}: ${l.item}` })));
    quantities.push(...e.quantities.map((q) => ({ ...q, item: `${r.name} — ${q.item}` })));
    for (const k of Object.keys(totals) as (keyof typeof totals)[]) totals[k] += e.totals[k];
    for (const k of Object.keys(geometry) as (keyof typeof geometry)[]) geometry[k] += outdoor && k !== "floorArea" ? 0 : e.geometry[k];
    range.low += e.range.low; range.high += e.range.high;
    rooms.push({ id: r.id, name: r.name, type: r.type, area: Math.round(r.length * r.width * 10) / 10, total: e.totals.total });
  }
  const round = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 100) / 100]));
  return {
    geometry: round(geometry) as Result["geometry"],
    quantities, lines,
    totals: round(totals) as Result["totals"],
    range: round(range) as Result["range"],
    rooms,
    assumptions: [
      `Whole house: ${house.rooms.length} spaces, ${geometry.floorArea.toFixed(1)} m² including outdoor areas; ceiling height ${house.height} m.`,
      "Rooms use their own floor/wall finish where set, otherwise the project finishes. Kitchens include cabinetry, tops and splashback; bathrooms include wall tiling.",
      `Doors and windows are counted from the floor plan (${ops.filter((o) => o.kind === "door" || o.kind === "front-door").length} doors, ${ops.filter((o) => o.kind === "window").length} windows).`,
      `Pricing tier: ${opts.quality}; VAT at 15% applied per room to subtotal plus contingency.`,
      "Indicative only — always obtain at least three written contractor quotes.",
    ],
  };
}

/** Estimate for a project: the whole house when it has a floor plan, otherwise its single room. */
export function estimateProject(sp: SP, opts: EstimateOptions, finishes: Finishes = finishesOf(sp)): Result {
  if (sp.house?.rooms?.length) return estimateHouse(sp.house, finishes, opts);
  return estimate(sp.room, finishes, opts);
}
