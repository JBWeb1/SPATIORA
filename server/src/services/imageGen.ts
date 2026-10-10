import { config } from "../config.js";
import { STYLES, type DesignStyle } from "../data/catalog.js";
import { imageSize, saveImage } from "../lib/images.js";

export interface RedesignPreferences {
  colors?: string[];
  materials?: string[];
  furniture?: string;
  lighting?: string;
  budget?: number;
  preserveLayout?: boolean;
  intensity?: number; // 0.2 .. 1
  extraPrompt?: string;
}

export interface RedesignInput {
  roomType: string;
  styleId: string;
  preferences: RedesignPreferences;
  source: { data: Buffer; mime: string } | null;
  variant: number;
}

export interface RedesignResult {
  imageUrl: string;
  provider: "studio-preview" | "replicate" | "custom";
  prompt: string;
}

export function getStyle(id: string): DesignStyle {
  return STYLES.find((s) => s.id === id) ?? STYLES[0];
}

export function buildPrompt(input: Omit<RedesignInput, "source" | "variant">): { prompt: string; negative: string } {
  const style = getStyle(input.styleId);
  const p = input.preferences;
  const parts = [
    `A photorealistic ${style.name.toLowerCase()} ${input.roomType.toLowerCase()} interior`,
    style.keywords.join(", "),
    `materials: ${[...(p.materials ?? []), ...style.materials].slice(0, 5).join(", ")}`,
  ];
  if (p.colors?.length) parts.push(`colour palette: ${p.colors.join(", ")}`);
  if (p.furniture) parts.push(`furniture: ${p.furniture}`);
  if (p.lighting) parts.push(`lighting: ${p.lighting}`);
  if (p.budget) parts.push(p.budget < 50000 ? "affordable, practical finishes" : p.budget > 250000 ? "high-end, bespoke finishes" : "mid-range quality finishes");
  if (p.preserveLayout !== false) parts.push("keep the original room layout, walls, windows and camera angle");
  if (p.extraPrompt) parts.push(p.extraPrompt);
  parts.push("interior design magazine photography, natural light, 8k, highly detailed");
  return {
    prompt: parts.join(". "),
    negative: "blurry, distorted perspective, warped walls, extra windows, people, text, watermark, low quality, cartoon",
  };
}

// ---------- Studio Preview: built-in renderer, no external services -------------------

const hexToRgb = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function paletteFor(style: DesignStyle, prefs: RedesignPreferences): string[] {
  const custom = (prefs.colors ?? []).filter((c) => /^#[0-9a-f]{6}$/i.test(c));
  if (custom.length < 2) return style.palette;
  // Blend user colours into the style palette, keeping a dark anchor and a light anchor.
  return [style.palette[0], ...custom.slice(0, 3), style.palette[style.palette.length - 1]];
}

function gradeFilter(style: DesignStyle, palette: string[], intensity: number) {
  const { warmth, saturation: s, contrast: c, brightness: b } = style.grade;
  const lr = 0.2126, lg = 0.7152, lb = 0.0722;
  const sat = [
    lr + (1 - lr) * s, lg - lg * s, lb - lb * s,
    lr - lr * s, lg + (1 - lg) * s, lb - lb * s,
    lr - lr * s, lg - lg * s, lb + (1 - lb) * s,
  ];
  const matrix = [
    sat[0], sat[1], sat[2], 0, warmth * 0.35,
    sat[3], sat[4], sat[5], 0, warmth * 0.1,
    sat[6], sat[7], sat[8], 0, -warmth * 0.25,
    0, 0, 0, 1, 0,
  ].map((n) => n.toFixed(4)).join(" ");
  const intercept = (0.5 - 0.5 * c + b).toFixed(4);
  const rgb = palette.map(hexToRgb);
  const table = (ch: number) => rgb.map((v) => v[ch].toFixed(3)).join(" ");
  const k = Math.min(Math.max(intensity, 0.1), 0.95) * 0.75;
  return `
  <filter id="restyle" color-interpolation-filters="sRGB">
    <feColorMatrix in="SourceGraphic" type="matrix" values="${matrix}" result="graded"/>
    <feComponentTransfer in="graded" result="tone">
      <feFuncR type="linear" slope="${c}" intercept="${intercept}"/>
      <feFuncG type="linear" slope="${c}" intercept="${intercept}"/>
      <feFuncB type="linear" slope="${c}" intercept="${intercept}"/>
    </feComponentTransfer>
    <feColorMatrix in="SourceGraphic" type="saturate" values="0" result="gray"/>
    <feComponentTransfer in="gray" result="mapped">
      <feFuncR type="table" tableValues="${table(0)}"/>
      <feFuncG type="table" tableValues="${table(1)}"/>
      <feFuncB type="table" tableValues="${table(2)}"/>
    </feComponentTransfer>
    <feComposite in="tone" in2="mapped" operator="arithmetic" k1="0" k2="${(1 - k).toFixed(3)}" k3="${k.toFixed(3)}" k4="0"/>
  </filter>`;
}

function blankRoomScene(style: DesignStyle, palette: string[], w: number, h: number, variant: number) {
  const [dark, mid, accent, light, lightest] = [palette[0], palette[1], palette[2] ?? palette[1], palette[3] ?? palette[2], palette[palette.length - 1]];
  const horizon = h * 0.62;
  const shift = (variant % 3) * w * 0.08;
  return `
  <rect width="${w}" height="${horizon}" fill="${lightest}"/>
  <rect x="${w * 0.08}" y="${h * 0.1}" width="${w * 0.84}" height="${horizon - h * 0.1}" fill="${light}" opacity="0.55"/>
  <polygon points="0,${h} ${w},${h} ${w * 0.92},${horizon} ${w * 0.08},${horizon}" fill="${mid}" opacity="0.85"/>
  <rect x="${w * 0.58 - shift}" y="${h * 0.16}" width="${w * 0.22}" height="${h * 0.3}" fill="#dfeef5" stroke="${dark}" stroke-width="${w * 0.006}"/>
  <line x1="${w * 0.69 - shift}" y1="${h * 0.16}" x2="${w * 0.69 - shift}" y2="${h * 0.46}" stroke="${dark}" stroke-width="${w * 0.004}"/>
  <rect x="${w * 0.14 + shift}" y="${horizon - h * 0.16}" width="${w * 0.36}" height="${h * 0.13}" rx="${w * 0.015}" fill="${accent}"/>
  <rect x="${w * 0.14 + shift}" y="${horizon - h * 0.22}" width="${w * 0.36}" height="${h * 0.08}" rx="${w * 0.015}" fill="${accent}" opacity="0.85"/>
  <rect x="${w * 0.3 + shift}" y="${horizon + h * 0.04}" width="${w * 0.22}" height="${h * 0.05}" rx="${w * 0.01}" fill="${dark}" opacity="0.8"/>
  <ellipse cx="${w * 0.42 + shift}" cy="${horizon + h * 0.12}" rx="${w * 0.3}" ry="${h * 0.07}" fill="${light}" opacity="0.6"/>
  <line x1="${w * 0.36 + shift}" y1="0" x2="${w * 0.36 + shift}" y2="${h * 0.12}" stroke="${dark}" stroke-width="${w * 0.002}"/>
  <circle cx="${w * 0.36 + shift}" cy="${h * 0.14}" r="${w * 0.03}" fill="${accent}"/>
  <rect x="${w * 0.84}" y="${horizon - h * 0.28}" width="${w * 0.05}" height="${h * 0.28}" fill="${dark}" opacity="0.7"/>
  <circle cx="${w * 0.865}" cy="${horizon - h * 0.3}" r="${w * 0.05}" fill="#5f7f55" opacity="0.9"/>`;
}

export function renderStudioPreview(input: RedesignInput): string {
  const style = getStyle(input.styleId);
  const palette = paletteFor(style, input.preferences);
  const dims = input.source ? imageSize(input.source.data) : null;
  const w = dims?.width ?? 1600;
  const h = dims?.height ?? 1200;
  const intensity = (input.preferences.intensity ?? 0.6) + (input.variant % 3) * 0.1;
  const angle = (input.variant * 47) % 180;
  const keywords = [...style.keywords].sort((a, b) => ((a.length * (input.variant + 3)) % 7) - ((b.length * (input.variant + 3)) % 7)).slice(0, 3);
  const fs = Math.round(w * 0.018);

  const base = input.source
    ? `<image href="data:${input.source.mime};base64,${input.source.data.toString("base64")}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" filter="url(#restyle)"/>`
    : `<g filter="url(#restyle)">${blankRoomScene(style, palette, w, h, input.variant)}</g>`;

  const callouts = keywords.map((k, i) => {
    const x = w * (0.08 + ((i * 0.31 + input.variant * 0.13) % 0.62));
    const y = h * (0.18 + ((i * 0.23 + input.variant * 0.07) % 0.5));
    const tw = k.length * fs * 0.58 + fs * 2.4;
    return `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)})">
      <circle r="${fs * 0.55}" fill="#ffffff" stroke="${palette[0]}" stroke-width="${fs * 0.15}"/>
      <rect x="${fs}" y="${-fs * 0.9}" width="${tw.toFixed(0)}" height="${fs * 1.8}" rx="${fs * 0.9}" fill="rgba(20,20,20,0.72)"/>
      <text x="${fs * 2.1}" y="${fs * 0.35}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="${fs}" fill="#fff">${esc(k)}</text>
    </g>`;
  }).join("");

  const swatch = Math.round(w * 0.035);
  const swatches = palette.map((c, i) => `<rect x="${w - swatch * (palette.length - i) - swatch * 0.6}" y="${h - swatch * 1.6}" width="${swatch}" height="${swatch}" fill="${c}" stroke="#fff" stroke-width="${swatch * 0.06}"/>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    ${gradeFilter(style, palette, intensity)}
    <linearGradient id="wash" gradientTransform="rotate(${angle} .5 .5)">
      <stop offset="0" stop-color="${palette[2] ?? palette[1]}" stop-opacity="0.35"/>
      <stop offset="1" stop-color="${palette[palette.length - 1]}" stop-opacity="0.05"/>
    </linearGradient>
    <radialGradient id="vignette" cx=".5" cy=".5" r=".75">
      <stop offset=".6" stop-color="#000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity="0.35"/>
    </radialGradient>
  </defs>
  ${base}
  <rect width="${w}" height="${h}" fill="url(#wash)" style="mix-blend-mode:soft-light"/>
  <rect width="${w}" height="${h}" fill="url(#vignette)"/>
  ${callouts}
  <g transform="translate(${fs * 1.4},${h - fs * 3.2})">
    <rect width="${(style.name.length + 18) * fs * 0.6}" height="${fs * 2.2}" rx="${fs * 0.4}" fill="rgba(20,20,20,0.78)"/>
    <text x="${fs * 0.8}" y="${fs * 1.45}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="${fs}" fill="#fff" letter-spacing="1">VISTORA · ${esc(style.name.toUpperCase())} · V${input.variant + 1}</text>
  </g>
  ${swatches}
</svg>`;
}

// ---------- External AI image providers --------------------------------------------------

async function fetchAsBuffer(url: string): Promise<{ data: Buffer; mime: string }> {
  if (url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.*)$/s.exec(url);
    if (!match) throw new Error("Malformed data URL from image provider");
    return { mime: match[1], data: Buffer.from(match[2], "base64") };
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download generated image (${res.status})`);
  return { mime: res.headers.get("content-type")?.split(";")[0] ?? "image/png", data: Buffer.from(await res.arrayBuffer()) };
}

async function replicate(input: RedesignInput, prompt: string, negative: string): Promise<{ data: Buffer; mime: string }> {
  if (!input.source) throw new Error("Replicate redesign requires a room photo");
  const headers = { Authorization: `Bearer ${config.images.replicateToken}`, "Content-Type": "application/json", Prefer: "wait" };
  const create = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      version: config.images.replicateVersion,
      input: { image: `data:${input.source.mime};base64,${input.source.data.toString("base64")}`, prompt, negative_prompt: negative },
    }),
  });
  if (!create.ok) throw new Error(`Replicate error ${create.status}: ${await create.text()}`);
  let prediction = (await create.json()) as { status: string; output: unknown; error?: string; urls: { get: string } };
  const started = Date.now();
  while (!["succeeded", "failed", "canceled"].includes(prediction.status)) {
    if (Date.now() - started > 180_000) throw new Error("Replicate prediction timed out");
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(prediction.urls.get, { headers });
    prediction = (await poll.json()) as typeof prediction;
  }
  if (prediction.status !== "succeeded") throw new Error(prediction.error ?? "Replicate prediction failed");
  const out = Array.isArray(prediction.output) ? prediction.output[prediction.output.length - 1] : prediction.output;
  if (typeof out !== "string") throw new Error("Unexpected Replicate output");
  return fetchAsBuffer(out);
}

async function customProvider(input: RedesignInput, prompt: string, negative: string) {
  const res = await fetch(config.images.providerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(config.images.providerKey ? { Authorization: `Bearer ${config.images.providerKey}` } : {}) },
    body: JSON.stringify({
      image: input.source ? `data:${input.source.mime};base64,${input.source.data.toString("base64")}` : null,
      prompt,
      negativePrompt: negative,
      style: input.styleId,
      roomType: input.roomType,
      preserveLayout: input.preferences.preserveLayout !== false,
    }),
  });
  if (!res.ok) throw new Error(`Image provider error ${res.status}`);
  const body = (await res.json()) as { image?: string };
  if (!body.image) throw new Error("Image provider returned no image");
  return fetchAsBuffer(body.image);
}

export function activeImageProvider(): RedesignResult["provider"] {
  if (config.images.providerUrl) return "custom";
  if (config.images.replicateToken && config.images.replicateVersion) return "replicate";
  return "studio-preview";
}

export async function generateRedesign(input: RedesignInput): Promise<RedesignResult> {
  const { prompt, negative } = buildPrompt(input);
  const provider = activeImageProvider();
  if (provider !== "studio-preview" && input.source) {
    try {
      const img = provider === "custom" ? await customProvider(input, prompt, negative) : await replicate(input, prompt, negative);
      return { imageUrl: saveImage(img.data, img.mime), provider, prompt };
    } catch (err) {
      console.error(`[vistora] ${provider} image generation failed, using Studio Preview:`, err);
    }
  }
  const svg = renderStudioPreview(input);
  return { imageUrl: saveImage(Buffer.from(svg, "utf8"), "image/svg+xml"), provider: "studio-preview", prompt };
}
