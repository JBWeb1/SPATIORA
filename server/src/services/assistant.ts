import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { MATERIALS, PRODUCTS, STYLES } from "../data/catalog.js";
import { getStyle } from "./imageGen.js";

export interface ProjectContext {
  name: string;
  roomType: string;
  budget: number;
  currency: string;
  room: { length: number; width: number; height: number };
  stylePreference?: string;
  finishes: Record<string, unknown>;
  province: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RoomAnalysis {
  roomType: string;
  estimatedDimensions: { length: number; width: number; height: number };
  features: string[];
  issues: string[];
  suggestedStyles: string[];
  quickWins: string[];
  summary: string;
}

let client: Anthropic | null = null;
const claude = () => (client ??= new Anthropic());

const SYSTEM = `You are the VISTORA AI Design Assistant: an experienced South African interior designer and renovation planner.
Help homeowners and design professionals plan rooms: layouts, styles, colour palettes, materials, lighting, budgets and renovation sequencing.
Guidelines:
- Be specific and practical. Give measurements in metres/centimetres and costs in the project's currency (default South African rand, VAT 15%).
- Consider South African realities when relevant: load-shedding and backup power, water-wise fixtures, SANS 10400 building regulations, electrical CoCs, local materials and suppliers, climate by region.
- When suggesting materials or styles, prefer items from VISTORA's catalogue (provided below) and mention them by name so the user can find them.
- For structural, electrical, gas or plumbing work, advise using registered professionals.
- Keep answers well structured with short headings or bullet points; aim for under 300 words unless the user asks for depth.

VISTORA styles: ${STYLES.map((s) => `${s.name} (${s.tagline})`).join("; ")}.
VISTORA materials: ${MATERIALS.map((m) => `${m.name} [${m.category}, R${m.price}/${m.unit}]`).join("; ")}.
VISTORA marketplace highlights: ${PRODUCTS.slice(0, 30).map((p) => `${p.name} (R${p.price})`).join("; ")}.`;

export function contextBlock(ctx: ProjectContext) {
  const area = (ctx.room.length * ctx.room.width).toFixed(1);
  return `Current project: "${ctx.name}" — ${ctx.roomType}, ${ctx.room.length}m × ${ctx.room.width}m (${area} m²), ceiling ${ctx.room.height}m, province ${ctx.province}.
Budget: ${ctx.budget ? `${ctx.currency} ${ctx.budget.toLocaleString("en-ZA")}` : "not set"}. Preferred style: ${ctx.stylePreference ? getStyle(ctx.stylePreference).name : "undecided"}.
Selected finishes: ${JSON.stringify(ctx.finishes)}.`;
}

export function textOf(message: Anthropic.Beta.BetaMessage): string {
  if (message.stop_reason === "refusal") {
    return "I can't help with that request, but I'm happy to help with your design or renovation plans.";
  }
  return message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
}

export async function ask(params: {
  messages: Anthropic.Beta.BetaMessageParam[];
  effort: "low" | "medium" | "high";
  schema?: Record<string, unknown>;
  maxTokens?: number;
}) {
  return claude().beta.messages.create({
    model: config.claude.model,
    max_tokens: params.maxTokens ?? 16000,
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    thinking: { type: "adaptive" },
    output_config: { effort: params.effort, ...(params.schema ? { format: { type: "json_schema", schema: params.schema } } : {}) },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: params.messages,
  });
}

type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
export const imageBlock = (img: { data: Buffer; mime: string }): Anthropic.Beta.BetaImageBlockParam => ({
  type: "image",
  source: { type: "base64", media_type: img.mime as ImageMime, data: img.data.toString("base64") },
});
export const visionSupported = (img: { mime: string } | null) => !!img && ["image/jpeg", "image/png", "image/webp"].includes(img.mime);

// ------------------------------- Chat ------------------------------------------------

export async function chat(ctx: ProjectContext, history: ChatTurn[], message: string, photo: { data: Buffer; mime: string } | null) {
  if (!config.claude.enabled) return { reply: ruleBasedReply(ctx, message), provider: "vistora-advisor" as const };

  const messages: Anthropic.Beta.BetaMessageParam[] = history.slice(-20).map((t) => ({ role: t.role, content: t.content }));
  const userContent: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (visionSupported(photo) && history.length === 0) userContent.push(imageBlock(photo!));
  userContent.push({ type: "text", text: `${contextBlock(ctx)}\n\n${message}` });
  messages.push({ role: "user", content: userContent });

  try {
    const res = await ask({ messages, effort: "medium" });
    return { reply: textOf(res) || ruleBasedReply(ctx, message), provider: "claude" as const };
  } catch (err) {
    console.error("[vistora] Claude chat failed, using rule-based advisor:", err);
    return { reply: ruleBasedReply(ctx, message), provider: "vistora-advisor" as const };
  }
}

// ---------------------------- Room analysis ------------------------------------------

const ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["roomType", "estimatedDimensions", "features", "issues", "suggestedStyles", "quickWins", "summary"],
  properties: {
    roomType: { type: "string" },
    estimatedDimensions: {
      type: "object",
      additionalProperties: false,
      required: ["length", "width", "height"],
      properties: { length: { type: "number" }, width: { type: "number" }, height: { type: "number" } },
    },
    features: { type: "array", items: { type: "string" } },
    issues: { type: "array", items: { type: "string" } },
    suggestedStyles: { type: "array", items: { type: "string", enum: STYLES.map((s) => s.id) } },
    quickWins: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
};

export async function analyzeRoom(ctx: ProjectContext, photo: { data: Buffer; mime: string } | null): Promise<{ analysis: RoomAnalysis; provider: string }> {
  if (config.claude.enabled && visionSupported(photo)) {
    try {
      const res = await ask({
        effort: "medium",
        schema: ANALYSIS_SCHEMA,
        messages: [{
          role: "user",
          content: [
            imageBlock(photo!),
            { type: "text", text: `${contextBlock(ctx)}\n\nAnalyse this room photo for a redesign. Estimate dimensions in metres, list notable existing features (windows, flooring, built-ins, light sources), problems to fix, 2–3 best-fit VISTORA style ids, and 3–5 low-cost quick wins. Keep each list item under 20 words.` },
          ],
        }],
      });
      const text = textOf(res);
      if (res.stop_reason !== "refusal" && text) return { analysis: JSON.parse(text) as RoomAnalysis, provider: "claude" };
    } catch (err) {
      console.error("[vistora] Claude room analysis failed, using heuristic analysis:", err);
    }
  }
  return { analysis: heuristicAnalysis(ctx), provider: "vistora-advisor" };
}

// ----------------------------- Design brief ------------------------------------------

export async function designBrief(ctx: ProjectContext, extras: { designs: { style: string; prompt: string }[]; estimateTotal?: number; tasks: string[] }) {
  const facts = `${contextBlock(ctx)}
Generated concepts: ${extras.designs.map((d) => getStyle(d.style).name).join(", ") || "none yet"}.
Estimated renovation total: ${extras.estimateTotal ? `R${Math.round(extras.estimateTotal).toLocaleString("en-ZA")}` : "not calculated"}.
Planned tasks: ${extras.tasks.join("; ") || "none yet"}.`;

  if (config.claude.enabled) {
    try {
      const res = await ask({
        effort: "medium",
        messages: [{ role: "user", content: `${facts}\n\nWrite a concise contractor-ready project brief in Markdown with sections: Overview, Scope of work, Finishes & materials schedule, Electrical/plumbing notes, Budget & timeline, Questions for the contractor. Use only the facts given; mark anything unknown as "To confirm on site".` }],
      });
      const text = textOf(res);
      if (text) return { brief: text, provider: "claude" };
    } catch (err) {
      console.error("[vistora] Claude brief failed, using template:", err);
    }
  }
  return { brief: templateBrief(ctx, extras), provider: "vistora-advisor" };
}

// ------------------------- Rule-based fallbacks --------------------------------------

function heuristicAnalysis(ctx: ProjectContext): RoomAnalysis {
  const area = ctx.room.length * ctx.room.width;
  const small = area < 12;
  const byRoom: Record<string, string[]> = {
    Kitchen: ["scandinavian", "farmhouse", "contemporary"],
    Bathroom: ["japandi", "minimalist", "modern-luxury"],
    Bedroom: ["japandi", "scandinavian", "coastal"],
    "Home office": ["mid-century", "minimalist", "industrial"],
  };
  return {
    roomType: ctx.roomType,
    estimatedDimensions: ctx.room,
    features: [`Approx. ${area.toFixed(1)} m² floor area`, `${ctx.room.height} m ceiling height`],
    issues: small ? ["Compact footprint — avoid bulky furniture and dark, heavy finishes"] : ["Large open area — zone it with rugs and lighting so it doesn't feel empty"],
    suggestedStyles: byRoom[ctx.roomType] ?? ["contemporary", "scandinavian", "afro-modern"],
    quickWins: [
      "Repaint walls in a warm white or greige to brighten the space",
      "Layer lighting: ambient downlights + warm 2700K lamps",
      "Add a large rug sized so front furniture legs sit on it",
      "Swap dated hardware and taps for brushed or matte black finishes",
    ],
    summary: `${small ? "A compact" : "A generous"} ${ctx.roomType.toLowerCase()} that will benefit from a cohesive palette, layered lighting and furniture scaled to the space. Connect an AI provider for photo-based analysis.`,
  };
}

function ruleBasedReply(ctx: ProjectContext, message: string): string {
  const m = message.toLowerCase();
  const style = getStyle(ctx.stylePreference ?? "contemporary");
  const area = ctx.room.length * ctx.room.width;
  const sections: string[] = [];

  if (/colou?r|palette|paint/.test(m)) {
    sections.push(`**Palette for ${style.name}:** ${style.palette.join(", ")}. Use the 60-30-10 rule — 60% a light base (walls), 30% a mid tone (large furniture, flooring), 10% an accent (cushions, art, hardware).`);
  }
  if (/layout|arrange|furniture|space/.test(m)) {
    sections.push(`**Layout (${area.toFixed(1)} m²):** keep 90 cm walkways, float the sofa off the wall if the room is wider than 3.5 m, and anchor seating with a rug at least 2×3 m. Use the 3D Studio to test placements before buying.`);
  }
  if (/light/.test(m)) {
    sections.push("**Lighting:** plan three layers — ambient (LED downlights ~1 per 1.5–2 m²), task (pendants over islands/desks) and accent (wall washers, lamps at 2700K). Put a rechargeable lamp or two on the backup circuit for load-shedding.");
  }
  if (/budget|cost|price|afford|cheap/.test(m)) {
    sections.push(`**Budget:** for a ${ctx.roomType.toLowerCase()}, allocate roughly 40% finishes & materials, 35% labour, 15% furniture/fixtures and keep 10% contingency. The Renovation Calculator gives a VAT-inclusive breakdown for your exact dimensions.`);
  }
  if (/load.?shed|solar|inverter|power|electric/.test(m)) {
    sections.push("**Backup power:** list your essentials (lights, Wi-Fi, TV, fridge, gate) in the Energy Planner. Most homes need a 5 kVA inverter with 5–10 kWh of LiFePO4 storage; use a PV GreenCard installer for a CoC.");
  }
  if (/material|floor|tile|counter|cabinet/.test(m)) {
    sections.push(`**Materials for ${style.name}:** ${style.materials.join(", ")}. In VISTORA's catalogue look at ${MATERIALS.filter((x) => x.category === "flooring").slice(0, 3).map((x) => x.name).join(", ")} for floors.`);
  }
  if (sections.length === 0) {
    sections.push(`Here's a starting plan for your ${ctx.roomType.toLowerCase()} in a **${style.name}** direction — ${style.tagline}`);
    sections.push(`- **Key elements:** ${style.keywords.slice(0, 4).join(", ")}\n- **Materials:** ${style.materials.join(", ")}\n- **Palette:** ${style.palette.join(", ")}`);
    sections.push("Ask me about colours, layout, lighting, materials, budget or backup power for more specific advice.");
  }
  sections.push("_Tip: connect Claude (set ANTHROPIC_API_KEY) for fully conversational, photo-aware advice._");
  return sections.join("\n\n");
}

function templateBrief(ctx: ProjectContext, extras: { designs: { style: string }[]; estimateTotal?: number; tasks: string[] }) {
  const finishes = Object.entries(ctx.finishes)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => `- **${k}:** ${MATERIALS.find((m) => m.id === v)?.name ?? v}`)
    .join("\n");
  return `# ${ctx.name} — Project brief

## Overview
${ctx.roomType} renovation, ${ctx.room.length} m × ${ctx.room.width} m, ceiling ${ctx.room.height} m (${ctx.province}). Preferred style: ${ctx.stylePreference ? getStyle(ctx.stylePreference).name : "To confirm on site"}.

## Scope of work
${extras.tasks.length ? extras.tasks.map((t) => `- ${t}`).join("\n") : "- To confirm on site"}

## Finishes & materials schedule
${finishes || "- To confirm on site"}

## Electrical/plumbing notes
- All electrical work to be done by a registered electrician with a Certificate of Compliance.
- Plumbing and gas work by registered practitioners. Confirm points on site.

## Budget & timeline
- Client budget: ${ctx.budget ? `${ctx.currency} ${ctx.budget.toLocaleString("en-ZA")}` : "To confirm"}
- VISTORA estimate (incl. VAT): ${extras.estimateTotal ? `R${Math.round(extras.estimateTotal).toLocaleString("en-ZA")}` : "To confirm"}

## Questions for the contractor
- Earliest start date and expected duration?
- Is the quote fixed-price, and what is excluded?
- Payment schedule and retention terms?
- Proof of registration, insurance and recent references?
`;
}
