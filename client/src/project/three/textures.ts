import * as THREE from "three";

// Procedural, seeded surface textures drawn on a canvas — realistic enough for
// planning views, with no image downloads or licensing to manage.

export type TextureKind = "planks" | "tiles-large" | "tiles-small" | "subway" | "terrazzo" | "concrete" | "carpet" | "marble" | "paint" | "limewash" | "slats" | "deck" | "fabric" | "wood";

/** Which texture a catalogue material uses, and how many metres one tile of it covers. */
export const MATERIAL_TEXTURE: Record<string, { kind: TextureKind; metres: number }> = {
  "floor-oak": { kind: "planks", metres: 1.6 },
  "floor-laminate": { kind: "planks", metres: 1.4 },
  "floor-vinyl": { kind: "planks", metres: 1.4 },
  "floor-porcelain": { kind: "tiles-large", metres: 2.4 },
  "floor-microcement": { kind: "concrete", metres: 3 },
  "floor-carpet": { kind: "carpet", metres: 1 },
  "floor-terrazzo": { kind: "terrazzo", metres: 1.2 },
  "wall-terracotta": { kind: "limewash", metres: 2.5 },
  "ceiling-timber": { kind: "slats", metres: 1.2 },
  "tiles-subway": { kind: "subway", metres: 0.6 },
  "tiles-zellige": { kind: "tiles-small", metres: 0.5 },
  "tiles-marble": { kind: "marble", metres: 1.2 },
  "tiles-terracotta": { kind: "tiles-small", metres: 0.8 },
  "counter-marble": { kind: "marble", metres: 1.2 },
  "counter-quartz": { kind: "terrazzo", metres: 2 },
  "counter-granite": { kind: "terrazzo", metres: 0.8 },
  "counter-butcher": { kind: "wood", metres: 1 },
};

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function shade(hex: string, amt: number) {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

function noise(ctx: CanvasRenderingContext2D, size: number, r: () => number, alpha: number, count: number, maxR = 1.5) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`;
    ctx.beginPath();
    ctx.arc(r() * size, r() * size, r() * maxR + 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw(kind: TextureKind, color: string): HTMLCanvasElement {
  const size = 512;
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d")!;
  const r = rng(kind.length * 977 + parseInt(color.slice(1), 16));
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);

  switch (kind) {
    case "planks":
    case "deck": {
      const rows = kind === "deck" ? 6 : 8;
      const h = size / rows;
      for (let row = 0; row < rows; row++) {
        let x = -r() * size * 0.6;
        while (x < size) {
          const len = size * (0.45 + r() * 0.5);
          ctx.fillStyle = shade(color, (r() - 0.5) * 0.12);
          ctx.fillRect(x, row * h, len, h);
          ctx.strokeStyle = shade(color, -0.12);
          ctx.globalAlpha = 0.35;
          for (let g = 0; g < 7; g++) {
            const y = row * h + r() * h;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.bezierCurveTo(x + len * 0.3, y + (r() - 0.5) * 6, x + len * 0.7, y + (r() - 0.5) * 6, x + len, y + (r() - 0.5) * 4);
            ctx.lineWidth = 0.6 + r();
            ctx.stroke();
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = shade(color, -0.22);
          ctx.fillRect(x, row * h, 1.5, h);
          x += len;
        }
        ctx.fillStyle = shade(color, -0.25);
        ctx.fillRect(0, row * h, size, kind === "deck" ? 4 : 1.5);
      }
      break;
    }
    case "wood": {
      ctx.strokeStyle = shade(color, -0.1);
      for (let i = 0; i < 60; i++) {
        const y = r() * size;
        ctx.globalAlpha = 0.25 + r() * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(size * 0.3, y + (r() - 0.5) * 20, size * 0.6, y + (r() - 0.5) * 20, size, y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "tiles-large":
    case "tiles-small":
    case "subway": {
      const cols = kind === "tiles-large" ? 2 : kind === "subway" ? 4 : 4;
      const rows = kind === "subway" ? 8 : cols;
      const w = size / cols, h = size / rows;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const off = kind === "subway" && y % 2 ? w / 2 : 0;
        ctx.fillStyle = shade(color, (r() - 0.5) * (kind === "tiles-small" ? 0.14 : 0.05));
        ctx.fillRect(x * w + off, y * h, w, h);
        if (off) ctx.fillRect(off - w, y * h, w, h);
      }
      noise(ctx, size, r, 0.04, 1500);
      ctx.strokeStyle = shade(color, kind === "tiles-large" ? -0.18 : -0.25);
      ctx.lineWidth = kind === "tiles-large" ? 2 : 3;
      for (let y = 0; y <= rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * h); ctx.lineTo(size, y * h); ctx.stroke(); }
      for (let y = 0; y < rows; y++) for (let x = 0; x <= cols; x++) {
        const off = kind === "subway" && y % 2 ? w / 2 : 0;
        ctx.beginPath(); ctx.moveTo(x * w + off, y * h); ctx.lineTo(x * w + off, (y + 1) * h); ctx.stroke();
      }
      break;
    }
    case "terrazzo": {
      noise(ctx, size, r, 0.05, 3000);
      const chips = ["#f2f0ea", "#7c7a74", "#b9a38a", "#3c3b38", "#d8cfc0"];
      for (let i = 0; i < 900; i++) {
        ctx.fillStyle = chips[Math.floor(r() * chips.length)];
        ctx.globalAlpha = 0.6 + r() * 0.4;
        ctx.beginPath();
        const x = r() * size, y = r() * size, s = 1 + r() * 5;
        ctx.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case "concrete":
    case "limewash": {
      for (let i = 0; i < 70; i++) {
        const g = ctx.createRadialGradient(r() * size, r() * size, 0, r() * size, r() * size, 40 + r() * 120);
        g.addColorStop(0, `rgba(${r() > 0.5 ? "255,255,255" : "0,0,0"},${kind === "limewash" ? 0.09 : 0.06})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, size, size);
      }
      noise(ctx, size, r, 0.05, 4000);
      break;
    }
    case "carpet":
    case "fabric":
      noise(ctx, size, r, kind === "carpet" ? 0.12 : 0.07, 14000, 1);
      break;
    case "marble": {
      noise(ctx, size, r, 0.03, 2000);
      ctx.strokeStyle = "rgba(90,90,95,0.35)";
      for (let i = 0; i < 9; i++) {
        let x = r() * size, y = 0;
        ctx.lineWidth = 0.6 + r() * 2;
        ctx.beginPath();
        ctx.moveTo(x, y);
        while (y < size) { x += (r() - 0.5) * 60; y += 20 + r() * 40; ctx.lineTo(x, y); }
        ctx.stroke();
      }
      break;
    }
    case "slats": {
      const n = 16;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = shade(color, (r() - 0.5) * 0.1);
        ctx.fillRect(i * (size / n), 0, size / n - 6, size);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(i * (size / n) + size / n - 6, 0, 6, size);
      }
      break;
    }
    case "paint":
      noise(ctx, size, r, 0.015, 3000);
      break;
  }
  return cv;
}

const cache = new Map<string, THREE.CanvasTexture>();

/** A repeating texture for a surface of the given size (metres). */
export function surfaceTexture(kind: TextureKind, color: string, widthM: number, heightM: number, metresPerTile: number) {
  const key = `${kind}|${color}`;
  let base = cache.get(key);
  if (!base) {
    base = new THREE.CanvasTexture(draw(kind, color));
    base.colorSpace = THREE.SRGBColorSpace;
    base.anisotropy = 8;
    cache.set(key, base);
  }
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(widthM / metresPerTile, 0.2), Math.max(heightM / metresPerTile, 0.2));
  t.needsUpdate = true;
  return t;
}

export function materialTexture(materialId: string | null | undefined, color: string, widthM: number, heightM: number, fallback: TextureKind = "paint") {
  const spec = (materialId && MATERIAL_TEXTURE[materialId]) || { kind: fallback, metres: fallback === "paint" ? 3 : 1.5 };
  return surfaceTexture(spec.kind, color, widthM, heightM, spec.metres);
}

export const roughnessFor = (materialId?: string | null) => {
  const k = materialId ? MATERIAL_TEXTURE[materialId]?.kind : undefined;
  return k === "tiles-large" || k === "marble" || k === "terrazzo" ? 0.25 : k === "carpet" ? 1 : k === "concrete" ? 0.6 : 0.7;
};
