import { MATERIALS, type MaterialCategory } from "../data/catalog.js";
import { estimate, type EstimateOptions, type Finishes, type RoomSpec } from "./estimator.js";

export interface Suggestion {
  kind: "swap" | "tier" | "contingency";
  category?: MaterialCategory;
  from?: { id: string; name: string };
  to?: { id: string; name: string; color: string };
  label: string;
  saving: number;       // ZAR incl. VAT
  styleFit: boolean;
  patch?: Finishes;
}

const KEYS: MaterialCategory[] = ["flooring", "wall", "ceiling", "tiles", "countertop", "cabinetry"];

/**
 * Find the cheapest-impact changes that bring a renovation closer to budget:
 * cheaper like-for-like material swaps (preferring ones that suit the chosen style),
 * a lower finish tier, and a leaner contingency.
 */
export function optimise(room: RoomSpec, finishes: Finishes, opts: EstimateOptions, styleMaterials: string[] = []) {
  const base = estimate(room, finishes, opts).totals.total;
  const suggestions: Suggestion[] = [];
  const styleWords = styleMaterials.join(" ").toLowerCase();

  for (const cat of KEYS) {
    const currentId = finishes[cat] as string | undefined;
    const current = MATERIALS.find((m) => m.id === currentId);
    if (!current) continue;
    const alternatives = MATERIALS.filter((m) => m.category === cat && m.id !== current.id && m.unit === current.unit && m.price < current.price);
    const scored = alternatives.map((alt) => {
      const total = estimate(room, { ...finishes, [cat]: alt.id }, opts).totals.total;
      const fit = styleWords.split(/[^a-z]+/).some((w) => w.length > 3 && alt.name.toLowerCase().includes(w));
      return { alt, saving: Math.round(base - total), fit };
    }).filter((s) => s.saving > 0).sort((a, b) => Number(b.fit) - Number(a.fit) || b.saving - a.saving);
    for (const s of scored.slice(0, 2)) {
      suggestions.push({
        kind: "swap", category: cat, from: { id: current.id, name: current.name }, to: { id: s.alt.id, name: s.alt.name, color: s.alt.color },
        label: `Swap ${current.name} for ${s.alt.name}`, saving: s.saving, styleFit: s.fit, patch: { [cat]: s.alt.id },
      });
    }
  }

  if (opts.quality !== "budget") {
    const lower = opts.quality === "premium" ? "standard" : "budget";
    const total = estimate(room, finishes, { ...opts, quality: lower }).totals.total;
    if (base - total > 0) suggestions.push({ kind: "tier", label: `Use ${lower} finish grades`, saving: Math.round(base - total), styleFit: true });
  }
  if (opts.contingency > 0.1) {
    const total = estimate(room, finishes, { ...opts, contingency: 0.1 }).totals.total;
    suggestions.push({ kind: "contingency", label: "Reduce contingency to 10% (keep at least 10%)", saving: Math.round(base - total), styleFit: true });
  }

  suggestions.sort((a, b) => b.saving - a.saving);
  // Best non-conflicting combination: at most one swap per category.
  const seen = new Set<string>();
  const combo = suggestions.filter((s) => s.kind === "swap" && !seen.has(s.category!) && seen.add(s.category!));
  const comboPatch = Object.assign({}, ...combo.map((s) => s.patch));
  const comboTotal = combo.length ? estimate(room, { ...finishes, ...comboPatch }, opts).totals.total : base;
  return { currentTotal: base, suggestions, bestCombination: { patch: comboPatch, total: comboTotal, saving: Math.round(base - comboTotal) } };
}
