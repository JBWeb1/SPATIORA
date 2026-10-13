import { config } from "../config.js";
import { PRODUCTS } from "../data/catalog.js";
import { imageSize } from "../lib/images.js";
import { ask, contextBlock, imageBlock, textOf, visionSupported, type ProjectContext } from "./assistant.js";
import { esc, getStyle, photoRealImage } from "./imageGen.js";

// "Tidy & organise": look at a photo of a room and help the owner make it
// look better and work better, with a score, clutter hotspots, a timed tidy
// plan, storage zones, matching organiser products and styling tips.

export interface Hotspot {
  label: string;
  problem: string;
  fix: string;
  severity: "high" | "medium" | "low";
  /** Position on the photo as 0–1 fractions, when the photo was analysed. */
  x: number | null;
  y: number | null;
}

export interface TidyReport {
  roomType: string;
  /** 0–100 organisation score from the photo; null when no photo analysis ran. */
  score: number | null;
  summary: string;
  hotspots: Hotspot[];
  steps: { title: string; detail: string; minutes: number }[];
  zones: { name: string; purpose: string }[];
  storage: { need: string; productId: string; why: string }[];
  layoutTips: string[];
  stylingTips: string[];
  habits: string[];
  sort: { keep: string[]; donate: string[]; recycle: string[] };
}

export const ORGANISER_IDS = PRODUCTS.filter((p) => p.subcategory === "Organisers" || p.subcategory === "Storage").map((p) => p.id);

const strings = { type: "array", items: { type: "string" } };
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["roomType", "score", "summary", "hotspots", "steps", "zones", "storage", "layoutTips", "stylingTips", "habits", "sort"],
  properties: {
    roomType: { type: "string" },
    score: { type: "integer" },
    summary: { type: "string" },
    hotspots: {
      type: "array",
      items: {
        type: "object", additionalProperties: false,
        required: ["label", "problem", "fix", "severity", "x", "y"],
        properties: {
          label: { type: "string" }, problem: { type: "string" }, fix: { type: "string" },
          severity: { type: "string", enum: ["high", "medium", "low"] },
          x: nullableNumber, y: nullableNumber,
        },
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["title", "detail", "minutes"],
        properties: { title: { type: "string" }, detail: { type: "string" }, minutes: { type: "integer" } },
      },
    },
    zones: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "purpose"], properties: { name: { type: "string" }, purpose: { type: "string" } } },
    },
    storage: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["need", "productId", "why"],
        properties: { need: { type: "string" }, productId: { type: "string", enum: ORGANISER_IDS }, why: { type: "string" } },
      },
    },
    layoutTips: strings,
    stylingTips: strings,
    habits: strings,
    sort: {
      type: "object", additionalProperties: false, required: ["keep", "donate", "recycle"],
      properties: { keep: strings, donate: strings, recycle: strings },
    },
  },
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Keep model output inside the shapes and ranges the app relies on. */
export function cleanReport(r: TidyReport): TidyReport {
  const pos = (n: number | null) => (typeof n === "number" && Number.isFinite(n) ? clamp(n, 0.03, 0.97) : null);
  return {
    ...r,
    score: typeof r.score === "number" ? Math.round(clamp(r.score, 0, 100)) : null,
    hotspots: r.hotspots.slice(0, 8).map((h) => ({ ...h, x: pos(h.x), y: pos(h.y) })),
    steps: r.steps.slice(0, 12).map((s) => ({ ...s, minutes: Math.round(clamp(s.minutes || 10, 2, 120)) })),
    storage: r.storage.filter((s) => ORGANISER_IDS.includes(s.productId)).slice(0, 6),
  };
}

export async function organiseRoom(ctx: ProjectContext, roomType: string, roomName: string, photo: { data: Buffer; mime: string } | null): Promise<{ report: TidyReport; provider: string }> {
  if (config.claude.enabled && visionSupported(photo)) {
    try {
      const res = await ask({
        effort: "medium",
        schema: REPORT_SCHEMA,
        messages: [{
          role: "user",
          content: [
            imageBlock(photo!),
            { type: "text", text: `${contextBlock(ctx)}

This photo shows the "${roomName}" (${roomType}). Act as a professional home organiser and stylist. Help the owner make this room look better and more organised using mostly what they already have.
- score: 0–100 for how tidy and organised the room looks right now (100 = magazine-ready, 50 = lived-in with visible clutter, 20 = hard to use).
- hotspots: up to 6 specific clutter or disorder spots you can see, each with the problem, a concrete fix and x/y as fractions of the photo width/height (0,0 = top-left) at the centre of the spot.
- steps: an ordered tidy plan in short sessions (most impact first), each with realistic minutes.
- zones: 2–4 storage/activity zones the room should have so everything has a home.
- storage: up to 4 organiser products from the allowed ids that solve real problems you saw (only if needed).
- layoutTips: furniture arrangement changes that improve flow and make the room look bigger or calmer.
- stylingTips: low-cost ways to make it look finished (styling surfaces, textiles, lighting, plants, art).
- habits: 3 daily 5-minute habits to keep it this way.
- sort: what to keep, donate or recycle based on what you see.
Be specific to what is visible. Keep each item under 25 words. Do not identify or comment on people.` },
          ],
        }],
      });
      const text = textOf(res);
      if (res.stop_reason !== "refusal" && text) return { report: cleanReport({ ...JSON.parse(text), roomType }), provider: "claude" };
    } catch (err) {
      console.error("[vistora] Claude tidy analysis failed, using the built-in organiser:", err);
    }
  }
  return { report: guideFor(roomType), provider: "vistora-advisor" };
}

// ------------------------- Built-in organiser (no AI key) ---------------------------

type Guide = Omit<TidyReport, "roomType" | "score" | "summary"> & { summary: string };

const COMMON_HABITS = [
  "Do a 5-minute reset every evening: everything back to its home",
  "One in, one out: when something new comes in, something old leaves",
  "Clear flat surfaces before bed; they attract clutter fastest",
];

const spot = (label: string, problem: string, fix: string, severity: Hotspot["severity"] = "medium"): Hotspot => ({ label, problem, fix, severity, x: null, y: null });

const GUIDES: Record<string, Guide> = {
  "Living room": {
    summary: "Living rooms collect remotes, cables, toys, post and laundry. Give every category a home near where it's used and keep the coffee table and floor clear.",
    hotspots: [
      spot("Coffee table", "Remotes, mugs and papers pile up", "Keep only a tray with remotes and one decor piece", "high"),
      spot("TV unit", "Visible cables and loose devices", "Bundle cables behind the unit; hide devices in closed storage", "medium"),
      spot("Sofa & floor", "Throws, bags and toys on seats and floor", "Basket for throws; bags go to a hook by the door", "high"),
      spot("Shelves", "Overcrowded shelves look messy", "Remove a third; group by colour and leave breathing space", "low"),
    ],
    steps: [
      { title: "Clear the floor", detail: "Pick up everything on the floor and put it in a 'sort later' basket", minutes: 10 },
      { title: "Reset the coffee table", detail: "Remove everything; return only a tray, remotes and one book or plant", minutes: 5 },
      { title: "Sort the basket", detail: "Return items to their rooms; donate or bin what has no home", minutes: 15 },
      { title: "Tame cables", detail: "Bundle with ties, run them behind furniture, use a cable box for the power strip", minutes: 15 },
      { title: "Edit shelves", detail: "Take everything off, wipe, put back a third less in groups of three", minutes: 20 },
      { title: "Style & finish", detail: "Plump cushions, fold the throw, open curtains fully, add a plant", minutes: 10 },
    ],
    zones: [
      { name: "Media zone", purpose: "TV, devices, remotes and cables in one closed unit" },
      { name: "Reading & relaxing", purpose: "Chair, lamp, small basket for current books and throws" },
      { name: "Kids corner (if needed)", purpose: "Labelled bins on a low rack so toys have a home" },
    ],
    storage: [
      { need: "Hide throws and toys", productId: "p-org-baskets", why: "Woven baskets look good on show and swallow clutter fast" },
      { need: "Closed storage for odds and ends", productId: "p-org-cube", why: "Cubes with fabric bins hide mess and double as display" },
      { need: "Messy cables", productId: "p-org-cable", why: "Hides the power strip and plugs under the TV" },
      { need: "Extra seating with storage", productId: "p-org-ottoman", why: "Seats guests and stores games and blankets" },
    ],
    layoutTips: [
      "Float the sofa 10–20 cm off the wall and anchor the seating with a rug large enough for the front legs",
      "Keep a clear 90 cm walkway from the door to the seating",
      "Face seating towards each other, not only at the TV, for a calmer, social layout",
    ],
    stylingTips: [
      "Use three cushions in two textures and one accent colour",
      "Group decor in odd numbers at varied heights",
      "Add a warm 2700K lamp in a dark corner for evening ambience",
      "A large plant in the corner makes the room feel finished",
    ],
    habits: COMMON_HABITS,
    sort: { keep: ["Things you used in the last year", "Sentimental pieces you display"], donate: ["DVDs and books you won't reread", "Spare cushions and throws"], recycle: ["Old magazines and post", "Dead batteries and broken chargers (e-waste drop-off)"] },
  },
  Kitchen: {
    summary: "Kitchens look tidy when the counters are clear. Store items where they're used, decant pantry basics and keep only daily tools on show.",
    hotspots: [
      spot("Countertops", "Appliances and groceries crowd the work space", "Keep only daily appliances out; store the rest in cupboards", "high"),
      spot("Sink area", "Dishes and sponges pile up", "Run or empty the dishwasher daily; caddy for sponges", "medium"),
      spot("Fridge door", "Magnets, papers and notes", "Keep one calendar or menu; file the rest", "low"),
      spot("Pantry", "Half-open packets and duplicates", "Decant basics into labelled jars; group by type", "medium"),
    ],
    steps: [
      { title: "Clear the counters", detail: "Remove everything that isn't used every day", minutes: 10 },
      { title: "Wash up & wipe", detail: "Dishes away, wipe counters, hob and splashback", minutes: 15 },
      { title: "Pantry sort", detail: "Bin expired items, combine duplicates, decant basics into jars", minutes: 30 },
      { title: "Zone the cupboards", detail: "Cooking near the hob, crockery near the dishwasher, cleaning under the sink", minutes: 30 },
      { title: "Drawers", detail: "Use dividers; one drawer for utensils, one for wraps and foil", minutes: 15 },
      { title: "Finishing touch", detail: "Board, bowl of fruit and a herb plant: nothing else on display", minutes: 5 },
    ],
    zones: [
      { name: "Prep zone", purpose: "Knives, boards and bowls between the sink and the hob" },
      { name: "Cooking zone", purpose: "Pots, pans, oils and spices next to the hob" },
      { name: "Cleaning zone", purpose: "Dishwasher, bin and cleaning products by the sink" },
      { name: "Pantry", purpose: "Food grouped by type in clear, labelled containers" },
    ],
    storage: [
      { need: "Messy pantry", productId: "p-org-pantry", why: "Clear jars show what you have and stop duplicates" },
      { need: "Jumbled drawers", productId: "p-org-drawer", why: "Every utensil gets a slot" },
      { need: "Not enough cupboard space", productId: "p-org-floating", why: "Open shelves for everyday crockery free up cupboards" },
    ],
    layoutTips: [
      "Keep the work triangle (sink, hob, fridge) clear of obstacles",
      "Store heavy items low and everyday items between hip and shoulder height",
      "Hang a rail for utensils to free a drawer",
    ],
    stylingTips: [
      "A wooden board and a bowl of lemons warm up a plain counter",
      "Matching dish soap dispenser and brush look calm by the sink",
      "Under-cabinet LED strips make counters feel bigger and brighter",
    ],
    habits: ["Clear the sink and wipe the counters every night", "Unpack groceries straight into the pantry zones", "Weekly fridge check before you shop"],
    sort: { keep: ["Tools you use weekly", "One good set of pots"], donate: ["Duplicate gadgets and mugs", "Unused appliances"], recycle: ["Old containers without lids", "Expired spices"] },
  },
  Bedroom: {
    summary: "A calm bedroom has a made bed, clear bedside tables and no 'chair-drobe'. Make wardrobe space work so clothes always have a home.",
    hotspots: [
      spot("Bed", "Unmade bed makes the room look messy", "Make the bed first thing; a throw and two cushions finish it", "high"),
      spot("Chair or floor", "Worn clothes pile up", "Hook or valet stand for 'wear again'; laundry basket for the rest", "high"),
      spot("Bedside tables", "Clutter of cups, chargers and books", "Lamp, one book, a charger, nothing else", "medium"),
      spot("Wardrobe", "Overstuffed and hard to use", "Remove what doesn't fit or isn't worn; add shelf dividers", "medium"),
    ],
    steps: [
      { title: "Make the bed", detail: "Straighten sheets, fold the throw, plump pillows", minutes: 5 },
      { title: "Clothes rescue", detail: "Hang, fold or put in the wash everything on the chair and floor", minutes: 15 },
      { title: "Bedside reset", detail: "Clear the tables; return cups to the kitchen", minutes: 5 },
      { title: "Wardrobe edit", detail: "Take out what you haven't worn in a year; donate", minutes: 45 },
      { title: "Under the bed", detail: "Only lidded drawers for seasonal clothes and linen", minutes: 15 },
    ],
    zones: [
      { name: "Sleep zone", purpose: "Bed and bedsides, kept clear and calm" },
      { name: "Dressing zone", purpose: "Wardrobe, mirror and laundry basket together" },
      { name: "Wear-again spot", purpose: "A hook or rail so worn clothes don't land on the chair" },
    ],
    storage: [
      { need: "Overflowing wardrobe", productId: "p-org-wardrobe", why: "Double rails and shelves fit more and keep it neat" },
      { need: "Seasonal clothes and linen", productId: "p-org-underbed", why: "Uses dead space under the bed" },
      { need: "Worn clothes on the chair", productId: "p-org-hooks", why: "A peg rail gives 'wear again' clothes a home" },
    ],
    layoutTips: [
      "Centre the bed on the main wall with space to walk on both sides",
      "Keep 60 cm in front of the wardrobe clear",
      "Avoid placing tall furniture in front of the window",
    ],
    stylingTips: [
      "Layer bedding in two or three tones; white sheets always look fresh",
      "Matching bedside lamps give instant symmetry",
      "Hang art centred above the headboard, 20–25 cm above it",
    ],
    habits: ["Make the bed every morning", "Clothes go hanging, folded or in the basket: never on the chair", "Put tomorrow's outfit out at night"],
    sort: { keep: ["Clothes that fit and you love", "Two sets of bedding per bed"], donate: ["Clothes not worn in 12 months", "Shoes that hurt"], recycle: ["Worn-out linen (textile recycling)", "Old hangers"] },
  },
  Bathroom: {
    summary: "Bathrooms feel spa-like when surfaces are clear and towels match. Keep only daily products on show and contain the rest.",
    hotspots: [
      spot("Vanity top", "Toiletries crowd the basin", "Keep soap and one tray; the rest goes in the drawer", "high"),
      spot("Shower", "Half-empty bottles", "Finish or toss duplicates; use a caddy", "medium"),
      spot("Towels", "Mismatched towels on the floor or door", "Hooks for each person; fold spares in thirds", "medium"),
    ],
    steps: [
      { title: "Clear surfaces", detail: "Take everything off the vanity and the shower ledge", minutes: 5 },
      { title: "Check expiry", detail: "Toss expired medicine (pharmacy drop-off) and empty bottles", minutes: 10 },
      { title: "Group & contain", detail: "Daily products in one tray, the rest in labelled bins in the drawer", minutes: 15 },
      { title: "Towel system", detail: "One hook per person; fold spares neatly on a shelf", minutes: 5 },
      { title: "Clean & style", detail: "Polish the mirror and taps; add a plant or a candle", minutes: 10 },
    ],
    zones: [
      { name: "Daily care", purpose: "Toothbrushes, soap and skincare in one tray by the basin" },
      { name: "Shower", purpose: "Only the products in use, in a caddy" },
      { name: "Back-up stock", purpose: "Spares and toilet rolls in closed storage" },
    ],
    storage: [
      { need: "Cluttered shower", productId: "p-org-caddy", why: "Gets bottles off the floor and ledges" },
      { need: "Messy vanity drawers", productId: "p-org-drawer", why: "Dividers keep small items sorted" },
      { need: "Loose towels and rolls", productId: "p-org-baskets", why: "Baskets for rolls and rolled towels look neat" },
    ],
    layoutTips: ["Mount hooks behind the door for towels and gowns", "Use the wall above the toilet for a shelf or cabinet", "Keep the floor clear so it looks bigger and is easy to clean"],
    stylingTips: ["Matching white or neutral towels instantly look hotel-like", "Decant hand soap into a glass or ceramic dispenser", "A small plant (pothos, fern) loves bathroom humidity"],
    habits: ["Wipe the basin after brushing teeth", "Hang towels to dry straight after use", "Toss empty bottles immediately"],
    sort: { keep: ["Products you use weekly"], donate: ["Unopened gift sets", "Spare new towels"], recycle: ["Empty plastic bottles", "Expired medicine (pharmacy take-back)"] },
  },
  "Home office": {
    summary: "An organised office has a clear desk, hidden cables and paper that's filed, not piled. Keep only today's work on the desk.",
    hotspots: [
      spot("Desk surface", "Papers, mugs and devices everywhere", "Inbox tray, pen pot and lamp only", "high"),
      spot("Cables", "Tangled cables under the desk", "Cable box and ties; run cables along the desk leg", "medium"),
      spot("Paper piles", "Unsorted post and documents", "Scan, file or shred weekly", "medium"),
    ],
    steps: [
      { title: "Clear the desk", detail: "Everything off except the computer and lamp", minutes: 10 },
      { title: "Paper triage", detail: "Act, file, scan or shred each sheet", minutes: 30 },
      { title: "Cable tidy", detail: "Bundle, label and hide cables and chargers", minutes: 15 },
      { title: "Set up zones", detail: "Supplies in a drawer organiser, files on a shelf", minutes: 15 },
    ],
    zones: [
      { name: "Focus zone", purpose: "Desk with only today's work" },
      { name: "Reference", purpose: "Files and books on a shelf within reach" },
      { name: "Supplies", purpose: "Stationery in a drawer organiser" },
    ],
    storage: [
      { need: "Cluttered desk", productId: "p-org-desk", why: "Lifts the screen and gives small things a home" },
      { need: "Cables", productId: "p-org-cable", why: "Hides the power strip and adapters" },
      { need: "Files and books", productId: "p-org-floating", why: "Uses wall space and keeps the desk clear" },
    ],
    layoutTips: ["Put the desk side-on or facing the window for daylight without glare", "Keep the printer off the desk", "Position the screen top at eye level"],
    stylingTips: ["A plant and one piece of art make video calls look professional", "Use a warm desk lamp for evening work", "Matching boxes or files look calm on open shelves"],
    habits: ["Clear the desk at the end of each workday", "File paper every Friday", "Close all tabs and charge devices at night"],
    sort: { keep: ["Documents you must legally keep (tax: 5 years)"], donate: ["Old monitors and keyboards that still work"], recycle: ["Shredded paper", "Old electronics (e-waste)"] },
  },
  "Kids room": {
    summary: "Kids can keep a room tidy when storage is low, open and labelled with pictures. Rotate toys so there's less out at once.",
    hotspots: [
      spot("Floor", "Toys everywhere", "Low bins with picture labels; tidy-up song at bedtime", "high"),
      spot("Wardrobe", "Clothes too high to reach", "Lower rail and drawers for daily clothes", "medium"),
      spot("Art & papers", "Drawings piling up", "Display wall for favourites; photograph and recycle the rest", "low"),
    ],
    steps: [
      { title: "Toy sweep", detail: "Gather all toys in one place", minutes: 10 },
      { title: "Sort by type", detail: "Blocks, cars, dolls, art, books: one bin each", minutes: 20 },
      { title: "Rotate", detail: "Store half the toys away; swap them monthly", minutes: 10 },
      { title: "Label", detail: "Picture labels on every bin", minutes: 15 },
    ],
    zones: [{ name: "Play", purpose: "Toys in low, labelled bins" }, { name: "Sleep", purpose: "Bed and a shelf for books" }, { name: "Create", purpose: "Small table with art supplies in a caddy" }],
    storage: [
      { need: "Toys on the floor", productId: "p-org-toys", why: "Kids can reach and see where things go" },
      { need: "Soft toys", productId: "p-org-baskets", why: "Quick to throw into, nice to look at" },
      { need: "Clothes and bags", productId: "p-org-hooks", why: "Low hooks let kids hang their own things" },
    ],
    layoutTips: ["Keep the centre of the room open for play", "Put storage at kid height", "Use under-bed space for rotated toys"],
    stylingTips: ["Frame kids' art in matching frames", "A rug defines the play zone", "Stick to two or three colours for a calmer room"],
    habits: ["Tidy-up time before the bedtime story", "One toy bin out at a time", "Monthly toy rotation"],
    sort: { keep: ["Favourite toys", "Age-appropriate books"], donate: ["Outgrown clothes and toys"], recycle: ["Broken toys", "Dried-out markers"] },
  },
  "Entrance & hallway": {
    summary: "The entrance sets the tone for the whole house. Give keys, bags and shoes a home here so they don't spread through the house.",
    hotspots: [
      spot("Floor by the door", "Shoes piling up", "Shoe rack for daily pairs only", "high"),
      spot("Console or ledge", "Keys, post and bags dumped", "Tray for keys, a post sorter, hooks for bags", "medium"),
    ],
    steps: [
      { title: "Shoe sort", detail: "Keep two daily pairs per person here; the rest go to bedrooms", minutes: 10 },
      { title: "Drop zone", detail: "Set up hooks, a key tray and a post basket", minutes: 15 },
      { title: "Clear the walkway", detail: "Remove anything blocking the passage", minutes: 5 },
    ],
    zones: [{ name: "Drop zone", purpose: "Keys, bags, post and sunglasses" }, { name: "Shoes", purpose: "Daily shoes only" }],
    storage: [
      { need: "Shoes everywhere", productId: "p-org-shoe", why: "Holds daily pairs neatly by the door" },
      { need: "Keys and post", productId: "p-org-console", why: "Drawers hide the clutter; top holds a tray and lamp" },
      { need: "Bags and jackets", productId: "p-org-hooks", why: "Gets bags off the floor and chairs" },
    ],
    layoutTips: ["Keep at least 90 cm clear through the passage", "A mirror opposite the door makes the entrance feel bigger"],
    stylingTips: ["A runner rug and a lamp on the console make a warm welcome", "One large artwork beats many small ones in a passage"],
    habits: ["Keys in the tray every time", "Post sorted the same day", "Shoes on the rack when you walk in"],
    sort: { keep: ["Daily shoes and jackets"], donate: ["Unused umbrellas, extra bags"], recycle: ["Junk mail and flyers"] },
  },
};

GUIDES["Dining room"] = {
  ...GUIDES["Living room"],
  summary: "Dining tables become drop zones for post, bags and school work. Keep the table clear with a single centrepiece and give papers a home elsewhere.",
  hotspots: [
    spot("Dining table", "Used as a desk and drop zone", "Clear it fully; keep only a centrepiece", "high"),
    spot("Chairs", "Bags and jackets on chair backs", "Hooks by the door for bags", "medium"),
    spot("Sideboard", "Overflowing with odds and ends", "Store table linen and serving ware only", "low"),
  ],
  zones: [{ name: "Dining", purpose: "Table with a single centrepiece" }, { name: "Serving storage", purpose: "Sideboard with linen, candles and serving ware" }],
  storage: [
    { need: "Odds and ends on the table", productId: "p-org-baskets", why: "A basket on the sideboard catches post and keys" },
    { need: "Serving ware", productId: "p-sideboard-teak", why: "Keeps linen and platters together near the table" },
  ],
};
GUIDES["Patio & outdoor"] = {
  summary: "Outdoor spaces stay inviting when cushions are stored dry, tools have a home and plants are grouped rather than scattered.",
  hotspots: [
    spot("Furniture", "Dusty cushions left out", "Store cushions in a dry box; wipe frames", "medium"),
    spot("Corners", "Tools, pots and toys collect", "Wall hooks and a storage bench", "medium"),
  ],
  steps: [
    { title: "Sweep and wipe", detail: "Sweep the deck, wipe furniture", minutes: 15 },
    { title: "Group plants", detail: "Cluster pots in odd numbers at varied heights", minutes: 15 },
    { title: "Store tools", detail: "Hang tools, store braai gear together", minutes: 15 },
  ],
  zones: [{ name: "Dining & braai", purpose: "Table near the braai with tools stored together" }, { name: "Lounge", purpose: "Seating and a side table" }],
  storage: [{ need: "Cushions and braai gear", productId: "p-org-ottoman", why: "Storage bench keeps cushions dry" }],
  layoutTips: ["Leave a clear path from the door to the garden", "Group seating to face the view"],
  stylingTips: ["Outdoor rug and string lights make it feel like a room", "Plant indigenous, water-wise plants in matching pots"],
  habits: ["Bring cushions in when it rains", "Sweep weekly"],
  sort: { keep: ["Furniture in good repair"], donate: ["Spare garden chairs"], recycle: ["Broken plastic pots"] },
};

/** Built-in organising plan for a room type, used without an AI key. */
export function guideFor(roomType: string): TidyReport {
  const g = GUIDES[roomType] ?? GUIDES["Living room"];
  return {
    ...structuredClone(g),
    roomType,
    score: null,
    summary: `${g.summary} Rate the room below to get your tidy score, or connect Claude for photo-based scoring and hotspots.`,
  };
}

// ------------------------------- Tidy render ---------------------------------------

export function tidyPrompt(roomType: string, report: TidyReport, styleId?: string) {
  const style = styleId ? getStyle(styleId) : null;
  const fixes = report.hotspots.slice(0, 4).map((h) => h.fix.toLowerCase()).join("; ");
  return {
    prompt: [
      `The same ${roomType.toLowerCase()}, perfectly tidy and organised, photorealistic`,
      "clear clean surfaces, nothing on the floor, items stored in baskets and closed storage, cables hidden, cushions plumped, bed made",
      fixes && `fixes: ${fixes}`,
      style && `subtle ${style.name.toLowerCase()} styling`,
      "keep the same furniture, walls, windows, flooring and camera angle, natural daylight, interior magazine photo",
    ].filter(Boolean).join(". "),
    negative: "clutter, mess, piles, laundry, cables, people, new walls, extra windows, distorted perspective, text, watermark, cartoon",
  };
}

/** Photo-real "after tidying" render, or an annotated tidy-plan image when no image AI is configured. */
export async function renderTidy(source: { data: Buffer; mime: string }, roomType: string, report: TidyReport, styleId?: string) {
  const { prompt, negative } = tidyPrompt(roomType, report, styleId);
  const img = await photoRealImage({ roomType, styleId: styleId ?? "contemporary", preferences: { intensity: 0.35, preserveLayout: true }, source, variant: 0 }, prompt, negative);
  if (img) return { kind: "photo" as const, image: img, provider: img.provider };
  return { kind: "plan" as const, image: { data: Buffer.from(tidyPlanSvg(source, report), "utf8"), mime: "image/svg+xml" }, provider: "studio-preview" as const };
}

/** The room photo with numbered hotspot pins and the fix for each one. */
export function tidyPlanSvg(source: { data: Buffer; mime: string }, report: TidyReport): string {
  const dims = imageSize(source.data);
  // Lay out on a canvas at least 1200 px wide so labels stay readable on small photos.
  const scale = Math.max(1, 1200 / (dims?.width ?? 1600));
  const w = Math.round((dims?.width ?? 1600) * scale);
  const h = Math.round((dims?.height ?? 1200) * scale);
  const fs = Math.round(Math.max(w, h) * 0.016);
  const placed = report.hotspots.map((s, i) => ({ s, n: i + 1, x: (s.x ?? 0.15 + (i % 3) * 0.3) * w, y: (s.y ?? 0.2 + Math.floor(i / 3) * 0.25) * h }));
  const colour = { high: "#c2410c", medium: "#b45309", low: "#4d7c0f" };
  const pins = placed.map(({ s, n, x, y }) => `<g transform="translate(${x.toFixed(0)},${y.toFixed(0)})">
    <circle r="${fs * 1.3}" fill="${colour[s.severity]}" stroke="#fff" stroke-width="${fs * 0.22}"/>
    <text text-anchor="middle" y="${fs * 0.42}" font-family="Inter,Helvetica,Arial,sans-serif" font-weight="700" font-size="${fs * 1.2}" fill="#fff">${n}</text>
  </g>`).join("");
  const lineH = fs * 1.7;
  const rows = placed.slice(0, 6);
  const panelH = lineH * (rows.length + 1.6);
  const legend = rows.map(({ s, n }, i) => {
    const text = `${n}. ${s.label}: ${s.fix}`;
    const max = Math.floor((w * 0.9) / (fs * 0.55));
    return `<text x="${fs * 1.2}" y="${lineH * (i + 2.1)}" font-family="Inter,Helvetica,Arial,sans-serif" font-size="${fs}" fill="#fff">${esc(text.length > max ? `${text.slice(0, max - 1)}…` : text)}</text>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <image href="data:${source.mime};base64,${source.data.toString("base64")}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>
  ${pins}
  <g transform="translate(0,${(h - panelH).toFixed(0)})">
    <rect width="${w}" height="${panelH.toFixed(0)}" fill="rgba(20,20,20,0.78)"/>
    <text x="${fs * 1.2}" y="${lineH * 1.05}" font-family="Inter,Helvetica,Arial,sans-serif" font-weight="700" font-size="${fs * 1.05}" fill="#fff" letter-spacing="1">VISTORA · TIDY PLAN${report.score != null ? ` · SCORE ${report.score}/100` : ""}</text>
    ${legend}
  </g>
</svg>`;
}
