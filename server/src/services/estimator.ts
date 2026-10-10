import { MATERIALS, PROVINCES, VAT_RATE, type Material } from "../data/catalog.js";

export interface RoomSpec {
  length: number;   // metres
  width: number;
  height: number;
  doors: number;
  windows: number;
}

export interface Finishes {
  flooring?: string;
  wall?: string;
  ceiling?: string;
  tiles?: string;
  tiledArea?: number;      // m2 of wall tiling (splashback / shower)
  countertop?: string;
  countertopLength?: number; // linear metres
  cabinetry?: string;
  cabinetryLength?: number;
}

export interface EstimateOptions {
  quality: "budget" | "standard" | "premium";
  province: string;
  includeDemolition: boolean;
  electricalPoints: number;
  plumbingPoints: number;
  contingency: number; // 0..0.3
}

export interface EstimateLine {
  group: "Materials" | "Labour" | "Services";
  item: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

const QUALITY = { budget: 0.75, standard: 1, premium: 1.45 } as const;
const WASTE = { flooring: 0.1, tiles: 0.12 };
const DOOR_AREA = 1.9;   // m2 per standard door
const WINDOW_AREA = 1.5; // m2 per average window

const round2 = (n: number) => Math.round(n * 100) / 100;
const findMat = (id?: string): Material | undefined => (id ? MATERIALS.find((m) => m.id === id) : undefined);

export function roomGeometry(room: RoomSpec) {
  const floorArea = room.length * room.width;
  const perimeter = 2 * (room.length + room.width);
  const grossWall = perimeter * room.height;
  const openings = room.doors * DOOR_AREA + room.windows * WINDOW_AREA;
  const wallArea = Math.max(0, grossWall - openings);
  return { floorArea: round2(floorArea), perimeter: round2(perimeter), wallArea: round2(wallArea), ceilingArea: round2(floorArea) };
}

export function estimate(room: RoomSpec, finishes: Finishes, opts: EstimateOptions) {
  const geo = roomGeometry(room);
  const q = QUALITY[opts.quality] ?? 1;
  const regional = PROVINCES.find((p) => p.name === opts.province)?.costFactor ?? 1;
  const lines: EstimateLine[] = [];
  const quantities: { item: string; quantity: number; unit: string; note: string }[] = [];

  const push = (group: EstimateLine["group"], item: string, quantity: number, unit: string, unitCost: number) => {
    if (quantity <= 0 || unitCost <= 0) return;
    lines.push({ group, item, quantity: round2(quantity), unit, unitCost: round2(unitCost), total: round2(quantity * unitCost) });
  };

  const paint = (mat: Material, area: number, label: string) => {
    if (mat.unit === "litre") {
      const coats = 2;
      const litres = Math.ceil((area * coats) / (mat.coverage ?? 10));
      quantities.push({ item: `${label}: ${mat.name}`, quantity: litres, unit: "L", note: `${area} m² × ${coats} coats @ ${mat.coverage ?? 10} m²/L` });
      push("Materials", `${mat.name} (${label.toLowerCase()})`, litres, "L", mat.price * q);
      push("Labour", `Painting — ${label.toLowerCase()}`, area, "m²", mat.labourPerUnit * coats * 0.5 * regional);
    } else {
      quantities.push({ item: `${label}: ${mat.name}`, quantity: area, unit: "m²", note: "" });
      push("Materials", `${mat.name} (${label.toLowerCase()})`, area, "m²", mat.price * q);
      push("Labour", `Install — ${label.toLowerCase()}`, area, "m²", mat.labourPerUnit * regional);
    }
  };

  const floor = findMat(finishes.flooring);
  if (floor) {
    const area = Math.ceil(geo.floorArea * (1 + WASTE.flooring) * 10) / 10;
    quantities.push({ item: `Flooring: ${floor.name}`, quantity: area, unit: "m²", note: `${geo.floorArea} m² + ${WASTE.flooring * 100}% cutting waste` });
    push("Materials", floor.name, area, "m²", floor.price * q);
    push("Labour", `Flooring installation`, geo.floorArea, "m²", floor.labourPerUnit * regional);
    push("Materials", "Skirting", geo.perimeter, "lm", 85 * q);
  }

  const wall = findMat(finishes.wall);
  if (wall) paint(wall, geo.wallArea, "Walls");

  const ceiling = findMat(finishes.ceiling);
  if (ceiling) paint(ceiling, geo.ceilingArea, "Ceiling");

  const tiles = findMat(finishes.tiles);
  if (tiles && (finishes.tiledArea ?? 0) > 0) {
    const area = Math.ceil((finishes.tiledArea ?? 0) * (1 + WASTE.tiles) * 10) / 10;
    const adhesiveBags = Math.ceil(area / 4);
    quantities.push({ item: `Wall tiles: ${tiles.name}`, quantity: area, unit: "m²", note: `${finishes.tiledArea} m² + 12% waste` });
    quantities.push({ item: "Tile adhesive (20kg)", quantity: adhesiveBags, unit: "bags", note: "≈4 m² per bag" });
    push("Materials", tiles.name, area, "m²", tiles.price * q);
    push("Materials", "Tile adhesive & grout", adhesiveBags, "bags", 240);
    push("Labour", "Tiling", finishes.tiledArea ?? 0, "m²", tiles.labourPerUnit * regional);
  }

  const counter = findMat(finishes.countertop);
  if (counter && (finishes.countertopLength ?? 0) > 0) {
    const len = finishes.countertopLength ?? 0;
    quantities.push({ item: `Countertop: ${counter.name}`, quantity: len, unit: "lm", note: "600mm depth" });
    push("Materials", counter.name, len, "lm", counter.price * q);
    push("Labour", "Countertop templating & fitting", len, "lm", counter.labourPerUnit * regional);
  }

  const cab = findMat(finishes.cabinetry);
  if (cab && (finishes.cabinetryLength ?? 0) > 0) {
    const len = finishes.cabinetryLength ?? 0;
    quantities.push({ item: `Cabinetry: ${cab.name}`, quantity: len, unit: "lm", note: "base + wall units" });
    push("Materials", `${cab.name} cabinetry`, len, "lm", cab.price * q);
    push("Labour", "Cabinet installation", len, "lm", cab.labourPerUnit * regional);
  }

  if (opts.includeDemolition) push("Services", "Strip-out, rubble removal & skip hire", geo.floorArea, "m²", 160 * regional);
  if (opts.electricalPoints > 0) push("Services", "Electrical points incl. CoC portion", opts.electricalPoints, "pts", 850 * regional * q);
  if (opts.plumbingPoints > 0) push("Services", "Plumbing points", opts.plumbingPoints, "pts", 1450 * regional * q);

  const sum = (group?: EstimateLine["group"]) => round2(lines.filter((l) => !group || l.group === group).reduce((s, l) => s + l.total, 0));
  const subtotal = sum();
  const contingency = round2(subtotal * Math.min(Math.max(opts.contingency, 0), 0.3));
  const vat = round2((subtotal + contingency) * VAT_RATE);
  const total = round2(subtotal + contingency + vat);

  return {
    geometry: geo,
    quantities,
    lines,
    totals: { materials: sum("Materials"), labour: sum("Labour"), services: sum("Services"), subtotal, contingency, vat, total },
    range: { low: round2(total * 0.88), high: round2(total * 1.15) },
    assumptions: [
      `Pricing tier: ${opts.quality}; regional factor ${regional} (${opts.province}).`,
      "Paint quantities assume two coats; flooring includes 10% and tiles 12% cutting waste.",
      `Openings deducted: ${room.doors} door(s) and ${room.windows} window(s).`,
      `VAT at ${VAT_RATE * 100}% applied to subtotal plus contingency.`,
      "Indicative only — always obtain at least three written contractor quotes.",
    ],
  };
}
