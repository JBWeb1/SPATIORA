// Reference data for VISTORA. Prices are indicative South African rand (ZAR)
// values for planning only. Retailers and contractors are sample listings;
// replace them with partner feeds in production.

export const ROOM_TYPES = [
  "Living room", "Kitchen", "Bathroom", "Bedroom", "Dining room",
  "Home office", "Kids room", "Patio & outdoor", "Entrance & hallway", "Whole home",
] as const;

export interface DesignStyle {
  id: string;
  name: string;
  tagline: string;
  palette: string[];          // hex swatches, darkest to lightest-ish
  materials: string[];
  keywords: string[];
  grade: { warmth: number; saturation: number; contrast: number; brightness: number };
}

export const STYLES: DesignStyle[] = [
  { id: "modern-luxury", name: "Modern Luxury", tagline: "Polished marble, brass accents and layered lighting.",
    palette: ["#1c1a17", "#3b3530", "#b08d57", "#d9cbb5", "#f4efe7"], materials: ["Calacatta marble", "Brushed brass", "Walnut veneer", "Velvet upholstery"],
    keywords: ["statement chandelier", "marble surfaces", "brass details", "plush velvet seating", "symmetrical layout"],
    grade: { warmth: 0.12, saturation: 1.05, contrast: 1.15, brightness: 0.02 } },
  { id: "minimalist", name: "Minimalist", tagline: "Calm, clutter-free and intentional.",
    palette: ["#2b2b2b", "#8a8a85", "#cfccc4", "#e8e6e1", "#fafaf8"], materials: ["Matte lacquer", "Light oak", "Microcement", "Linen"],
    keywords: ["clean lines", "hidden storage", "neutral palette", "negative space", "low-profile furniture"],
    grade: { warmth: 0.0, saturation: 0.75, contrast: 1.0, brightness: 0.08 } },
  { id: "scandinavian", name: "Scandinavian", tagline: "Light timber, soft textiles, hygge warmth.",
    palette: ["#3d4a52", "#a3b1a8", "#d8c3a5", "#efe9e1", "#ffffff"], materials: ["White oak", "Wool", "Rattan", "Ceramic"],
    keywords: ["pale timber floors", "cosy textiles", "white walls", "natural light", "organic shapes"],
    grade: { warmth: 0.06, saturation: 0.85, contrast: 0.95, brightness: 0.1 } },
  { id: "industrial", name: "Industrial", tagline: "Raw brick, black steel and reclaimed wood.",
    palette: ["#1f1f1f", "#4a4642", "#7a5a43", "#a8a29a", "#d6d0c8"], materials: ["Exposed brick", "Black steel", "Reclaimed timber", "Polished concrete"],
    keywords: ["exposed brick", "metal framed shelving", "Edison bulbs", "leather sofa", "concrete floor"],
    grade: { warmth: 0.08, saturation: 0.8, contrast: 1.2, brightness: -0.04 } },
  { id: "contemporary", name: "Contemporary", tagline: "Current, crisp and quietly bold.",
    palette: ["#202833", "#4f6d7a", "#c0d6df", "#e8eef1", "#f9fafb"], materials: ["Porcelain slab", "Glass", "Powder-coated steel", "Boucle"],
    keywords: ["curved furniture", "statement art", "tonal layering", "large-format tiles", "sculptural lighting"],
    grade: { warmth: -0.04, saturation: 0.95, contrast: 1.1, brightness: 0.04 } },
  { id: "farmhouse", name: "Modern Farmhouse", tagline: "Shiplap, butcher block and lived-in comfort.",
    palette: ["#2f3a2f", "#6b7d5c", "#c9b79c", "#ece4d6", "#fbf8f2"], materials: ["Shiplap", "Butcher block", "Wrought iron", "Cotton"],
    keywords: ["shaker cabinets", "farmhouse sink", "open shelving", "vintage accents", "warm timber beams"],
    grade: { warmth: 0.14, saturation: 0.9, contrast: 1.0, brightness: 0.03 } },
  { id: "afro-modern", name: "Afro-Modern", tagline: "Earthy South African textures with modern restraint.",
    palette: ["#2a1d15", "#8c4a2f", "#c98a4b", "#e7d3b0", "#f6efe3"], materials: ["Kiaat timber", "Woven grass", "Terracotta", "Mud-cloth textiles"],
    keywords: ["handwoven baskets", "terracotta tones", "local timber", "bold geometric textiles", "indigenous plants"],
    grade: { warmth: 0.2, saturation: 1.1, contrast: 1.05, brightness: 0.0 } },
  { id: "coastal", name: "Coastal", tagline: "Breezy whites, sea-glass blues and natural fibres.",
    palette: ["#1d3b53", "#5b8fa8", "#a9cfd8", "#efe8da", "#ffffff"], materials: ["Whitewashed timber", "Jute", "Linen", "Sea grass"],
    keywords: ["airy layout", "blue and white palette", "natural fibre rugs", "sheer curtains", "driftwood accents"],
    grade: { warmth: -0.06, saturation: 0.9, contrast: 0.95, brightness: 0.12 } },
  { id: "japandi", name: "Japandi", tagline: "Japanese calm meets Scandinavian function.",
    palette: ["#2e2a25", "#6e6355", "#b3a48f", "#ddd3c3", "#f3efe8"], materials: ["Ash timber", "Paper lanterns", "Stoneware", "Tatami-inspired weaves"],
    keywords: ["low furniture", "muted earth tones", "wabi-sabi ceramics", "slatted timber", "soft diffuse light"],
    grade: { warmth: 0.08, saturation: 0.7, contrast: 0.95, brightness: 0.05 } },
  { id: "mid-century", name: "Mid-Century Modern", tagline: "Tapered legs, teak and retro colour pops.",
    palette: ["#263238", "#c4572a", "#e0a43a", "#6d8b74", "#f2ebdd"], materials: ["Teak", "Moulded plywood", "Brass", "Tweed"],
    keywords: ["tapered legs", "teak sideboard", "sputnik light", "mustard and teal accents", "organic curves"],
    grade: { warmth: 0.15, saturation: 1.15, contrast: 1.05, brightness: 0.0 } },
];

export type MaterialCategory = "flooring" | "wall" | "ceiling" | "tiles" | "countertop" | "cabinetry";

export interface Material {
  id: string;
  category: MaterialCategory;
  name: string;
  color: string;
  unit: "m2" | "litre" | "lm";
  price: number;           // ZAR per unit, mid-range supply cost
  labourPerUnit: number;   // ZAR installation per unit
  coverage?: number;       // m2 per litre for paints
  roughness?: number;
}

export const MATERIALS: Material[] = [
  { id: "floor-oak", category: "flooring", name: "Engineered oak", color: "#b48a5a", unit: "m2", price: 650, labourPerUnit: 180, roughness: 0.6 },
  { id: "floor-laminate", category: "flooring", name: "Laminate (AC4)", color: "#a7835e", unit: "m2", price: 240, labourPerUnit: 110, roughness: 0.7 },
  { id: "floor-vinyl", category: "flooring", name: "Luxury vinyl plank", color: "#9c8b77", unit: "m2", price: 320, labourPerUnit: 120, roughness: 0.7 },
  { id: "floor-porcelain", category: "flooring", name: "Porcelain 600×1200", color: "#cfc9c0", unit: "m2", price: 420, labourPerUnit: 260, roughness: 0.3 },
  { id: "floor-microcement", category: "flooring", name: "Microcement", color: "#a9a6a0", unit: "m2", price: 780, labourPerUnit: 450, roughness: 0.5 },
  { id: "floor-carpet", category: "flooring", name: "Wool-blend carpet", color: "#8d8478", unit: "m2", price: 380, labourPerUnit: 90, roughness: 1 },
  { id: "floor-terrazzo", category: "flooring", name: "Terrazzo", color: "#d9d4cb", unit: "m2", price: 950, labourPerUnit: 520, roughness: 0.35 },
  { id: "wall-white", category: "wall", name: "Warm white paint", color: "#f3efe7", unit: "litre", price: 95, labourPerUnit: 38, coverage: 10 },
  { id: "wall-greige", category: "wall", name: "Greige paint", color: "#cbc3b6", unit: "litre", price: 105, labourPerUnit: 38, coverage: 10 },
  { id: "wall-sage", category: "wall", name: "Sage green paint", color: "#9fae95", unit: "litre", price: 110, labourPerUnit: 38, coverage: 10 },
  { id: "wall-navy", category: "wall", name: "Deep navy paint", color: "#2c3e57", unit: "litre", price: 120, labourPerUnit: 38, coverage: 9 },
  { id: "wall-terracotta", category: "wall", name: "Terracotta limewash", color: "#c27b5a", unit: "litre", price: 160, labourPerUnit: 55, coverage: 8 },
  { id: "wall-charcoal", category: "wall", name: "Charcoal paint", color: "#3d3d3d", unit: "litre", price: 115, labourPerUnit: 38, coverage: 9 },
  { id: "ceiling-white", category: "ceiling", name: "Ceiling white", color: "#fbfbf8", unit: "litre", price: 80, labourPerUnit: 45, coverage: 10 },
  { id: "ceiling-timber", category: "ceiling", name: "Timber slat ceiling", color: "#a77d52", unit: "m2", price: 690, labourPerUnit: 260 },
  { id: "tiles-subway", category: "tiles", name: "White subway tile", color: "#f1f1ee", unit: "m2", price: 260, labourPerUnit: 280 },
  { id: "tiles-zellige", category: "tiles", name: "Zellige (green)", color: "#4f7a64", unit: "m2", price: 980, labourPerUnit: 340 },
  { id: "tiles-marble", category: "tiles", name: "Marble-look porcelain", color: "#e7e3dd", unit: "m2", price: 450, labourPerUnit: 300 },
  { id: "tiles-terracotta", category: "tiles", name: "Terracotta tile", color: "#b8653f", unit: "m2", price: 380, labourPerUnit: 290 },
  { id: "counter-quartz", category: "countertop", name: "Engineered quartz", color: "#ece9e4", unit: "lm", price: 4200, labourPerUnit: 650 },
  { id: "counter-granite", category: "countertop", name: "Granite (Rustenburg)", color: "#3a3a3c", unit: "lm", price: 3100, labourPerUnit: 600 },
  { id: "counter-butcher", category: "countertop", name: "Butcher block", color: "#b5834f", unit: "lm", price: 2400, labourPerUnit: 420 },
  { id: "counter-marble", category: "countertop", name: "Calacatta marble", color: "#f2efea", unit: "lm", price: 7800, labourPerUnit: 800 },
  { id: "cab-white-shaker", category: "cabinetry", name: "White shaker", color: "#f2f0eb", unit: "lm", price: 6200, labourPerUnit: 900 },
  { id: "cab-oak-flat", category: "cabinetry", name: "Oak flat-panel", color: "#b88f5f", unit: "lm", price: 7400, labourPerUnit: 900 },
  { id: "cab-navy", category: "cabinetry", name: "Navy lacquer", color: "#24344d", unit: "lm", price: 8100, labourPerUnit: 950 },
  { id: "cab-sage", category: "cabinetry", name: "Sage shaker", color: "#8e9f86", unit: "lm", price: 6600, labourPerUnit: 900 },
];

export interface Product {
  id: string;
  name: string;
  category: "Furniture" | "Lighting" | "Appliances" | "Fixtures" | "Decor" | "Building materials" | "Energy";
  subcategory: string;
  retailer: string;
  price: number;              // ZAR incl. VAT
  styles: string[];
  color: string;
  size: { w: number; d: number; h: number }; // metres, for 3D placement
  rating: number;
  ecoRated?: boolean;
  localMade?: boolean;
  leadTimeDays: number;
}

const R = { karoo: "Karoo Living", cape: "Cape Home Co.", highveld: "Highveld Hardware", ubuntu: "Ubuntu Makers", sol: "SunVolt Energy", coast: "Coastline Interiors" };

export const PRODUCTS: Product[] = [
  { id: "p-sofa-boucle", name: "Curve 3-seater bouclé sofa", category: "Furniture", subcategory: "Sofas", retailer: R.cape, price: 18999, styles: ["contemporary", "modern-luxury", "japandi"], color: "#e9e3d8", size: { w: 2.3, d: 0.95, h: 0.75 }, rating: 4.6, leadTimeDays: 21 },
  { id: "p-sofa-leather", name: "Cognac leather Chesterfield", category: "Furniture", subcategory: "Sofas", retailer: R.karoo, price: 24500, styles: ["industrial", "mid-century"], color: "#8a4b2a", size: { w: 2.2, d: 0.9, h: 0.78 }, rating: 4.7, localMade: true, leadTimeDays: 35 },
  { id: "p-sofa-linen", name: "Linen slipcover sofa", category: "Furniture", subcategory: "Sofas", retailer: R.coast, price: 14200, styles: ["coastal", "scandinavian", "farmhouse"], color: "#e6e1d6", size: { w: 2.1, d: 0.92, h: 0.8 }, rating: 4.4, leadTimeDays: 14 },
  { id: "p-armchair-teak", name: "Teak lounge armchair", category: "Furniture", subcategory: "Chairs", retailer: R.karoo, price: 7900, styles: ["mid-century", "afro-modern"], color: "#9c6b3f", size: { w: 0.78, d: 0.82, h: 0.76 }, rating: 4.5, localMade: true, leadTimeDays: 28 },
  { id: "p-armchair-wishbone", name: "Wishbone dining chair", category: "Furniture", subcategory: "Chairs", retailer: R.cape, price: 3450, styles: ["scandinavian", "japandi", "minimalist"], color: "#c9a77c", size: { w: 0.55, d: 0.52, h: 0.76 }, rating: 4.3, leadTimeDays: 10 },
  { id: "p-coffee-travertine", name: "Travertine coffee table", category: "Furniture", subcategory: "Tables", retailer: R.cape, price: 9800, styles: ["modern-luxury", "contemporary", "japandi"], color: "#d8c8ad", size: { w: 1.2, d: 0.7, h: 0.38 }, rating: 4.8, leadTimeDays: 30 },
  { id: "p-coffee-reclaimed", name: "Reclaimed sleeper-wood coffee table", category: "Furniture", subcategory: "Tables", retailer: R.ubuntu, price: 5600, styles: ["industrial", "farmhouse", "afro-modern"], color: "#6e4f36", size: { w: 1.3, d: 0.7, h: 0.42 }, rating: 4.6, ecoRated: true, localMade: true, leadTimeDays: 18 },
  { id: "p-dining-oak", name: "Solid oak 6-seater dining table", category: "Furniture", subcategory: "Tables", retailer: R.karoo, price: 16900, styles: ["scandinavian", "farmhouse", "japandi"], color: "#b58c5d", size: { w: 1.8, d: 0.9, h: 0.75 }, rating: 4.7, localMade: true, leadTimeDays: 30 },
  { id: "p-bed-queen", name: "Upholstered queen bed", category: "Furniture", subcategory: "Beds", retailer: R.cape, price: 12500, styles: ["contemporary", "modern-luxury", "coastal"], color: "#cfc7ba", size: { w: 1.6, d: 2.1, h: 1.1 }, rating: 4.5, leadTimeDays: 21 },
  { id: "p-bed-platform", name: "Low timber platform bed", category: "Furniture", subcategory: "Beds", retailer: R.ubuntu, price: 9800, styles: ["japandi", "minimalist", "scandinavian"], color: "#a98258", size: { w: 1.7, d: 2.15, h: 0.35 }, rating: 4.6, localMade: true, ecoRated: true, leadTimeDays: 25 },
  { id: "p-sideboard-teak", name: "Teak sideboard", category: "Furniture", subcategory: "Storage", retailer: R.karoo, price: 11200, styles: ["mid-century", "afro-modern"], color: "#8f5f37", size: { w: 1.6, d: 0.45, h: 0.75 }, rating: 4.6, leadTimeDays: 28 },
  { id: "p-shelf-steel", name: "Black steel open shelving", category: "Furniture", subcategory: "Storage", retailer: R.highveld, price: 4300, styles: ["industrial", "contemporary"], color: "#222222", size: { w: 1.0, d: 0.35, h: 1.9 }, rating: 4.2, localMade: true, leadTimeDays: 7 },
  { id: "p-org-cube", name: "9-cube storage unit", category: "Furniture", subcategory: "Organisers", retailer: R.cape, price: 2490, styles: ["scandinavian", "contemporary", "minimalist"], color: "#f1ede6", size: { w: 1.1, d: 0.39, h: 1.1 }, rating: 4.4, leadTimeDays: 5 },
  { id: "p-org-ottoman", name: "Storage ottoman bench", category: "Furniture", subcategory: "Organisers", retailer: R.coast, price: 2800, styles: ["coastal", "contemporary", "farmhouse"], color: "#c9bda9", size: { w: 1.0, d: 0.4, h: 0.45 }, rating: 4.5, leadTimeDays: 7 },
  { id: "p-org-console", name: "Entryway storage console with drawers", category: "Furniture", subcategory: "Organisers", retailer: R.karoo, price: 3600, styles: ["scandinavian", "japandi", "mid-century", "afro-modern"], color: "#b58c5d", size: { w: 1.0, d: 0.32, h: 0.8 }, rating: 4.6, localMade: true, leadTimeDays: 14 },
  { id: "p-org-shoe", name: "Bamboo shoe rack (3-tier)", category: "Furniture", subcategory: "Organisers", retailer: R.coast, price: 790, styles: ["japandi", "scandinavian", "coastal"], color: "#c9a77c", size: { w: 0.8, d: 0.3, h: 0.55 }, rating: 4.3, ecoRated: true, leadTimeDays: 3 },
  { id: "p-org-floating", name: "Floating oak shelves (pair)", category: "Furniture", subcategory: "Organisers", retailer: R.karoo, price: 1350, styles: ["scandinavian", "japandi", "minimalist", "farmhouse"], color: "#b58c5d", size: { w: 0.9, d: 0.22, h: 0.04 }, rating: 4.5, localMade: true, leadTimeDays: 7 },
  { id: "p-org-underbed", name: "Under-bed storage drawers (2)", category: "Furniture", subcategory: "Organisers", retailer: R.cape, price: 990, styles: [], color: "#e4ded3", size: { w: 0.9, d: 0.6, h: 0.18 }, rating: 4.2, leadTimeDays: 5 },
  { id: "p-org-wardrobe", name: "Wardrobe organiser kit (rails, shelves, drawers)", category: "Furniture", subcategory: "Organisers", retailer: R.highveld, price: 1890, styles: [], color: "#f2f0eb", size: { w: 1.2, d: 0.5, h: 0.05 }, rating: 4.4, leadTimeDays: 5 },
  { id: "p-org-baskets", name: "Seagrass baskets (set of 3)", category: "Decor", subcategory: "Organisers", retailer: R.ubuntu, price: 650, styles: ["afro-modern", "coastal", "farmhouse", "japandi", "scandinavian"], color: "#c8b08a", size: { w: 0.4, d: 0.3, h: 0.3 }, rating: 4.8, localMade: true, ecoRated: true, leadTimeDays: 4 },
  { id: "p-org-hooks", name: "Oak peg rail with 6 hooks", category: "Decor", subcategory: "Organisers", retailer: R.ubuntu, price: 480, styles: ["scandinavian", "farmhouse", "japandi", "coastal"], color: "#b58c5d", size: { w: 0.9, d: 0.06, h: 0.1 }, rating: 4.6, localMade: true, leadTimeDays: 4 },
  { id: "p-org-drawer", name: "Bamboo drawer dividers (set of 6)", category: "Decor", subcategory: "Organisers", retailer: R.coast, price: 420, styles: [], color: "#d6b98d", size: { w: 0.4, d: 0.3, h: 0.06 }, rating: 4.5, ecoRated: true, leadTimeDays: 3 },
  { id: "p-org-pantry", name: "Glass pantry jars with labels (12)", category: "Decor", subcategory: "Organisers", retailer: R.cape, price: 720, styles: [], color: "#e8eef0", size: { w: 0.5, d: 0.2, h: 0.25 }, rating: 4.6, ecoRated: true, leadTimeDays: 3 },
  { id: "p-org-caddy", name: "Bathroom shower caddy & over-door hooks", category: "Decor", subcategory: "Organisers", retailer: R.highveld, price: 390, styles: [], color: "#2b2b2b", size: { w: 0.3, d: 0.12, h: 0.5 }, rating: 4.1, leadTimeDays: 2 },
  { id: "p-org-cable", name: "Cable management box & ties", category: "Decor", subcategory: "Organisers", retailer: R.highveld, price: 260, styles: [], color: "#f4f4f2", size: { w: 0.4, d: 0.15, h: 0.13 }, rating: 4.4, leadTimeDays: 2 },
  { id: "p-org-toys", name: "Kids toy bins & labelled rack", category: "Furniture", subcategory: "Organisers", retailer: R.cape, price: 1290, styles: [], color: "#e9e3d8", size: { w: 0.9, d: 0.3, h: 0.8 }, rating: 4.5, leadTimeDays: 5 },
  { id: "p-org-desk", name: "Desk organiser & monitor riser", category: "Decor", subcategory: "Organisers", retailer: R.karoo, price: 690, styles: ["mid-century", "minimalist", "scandinavian"], color: "#8f5f37", size: { w: 0.6, d: 0.25, h: 0.12 }, rating: 4.4, localMade: true, leadTimeDays: 5 },
  { id: "p-desk-walnut", name: "Walnut writing desk", category: "Furniture", subcategory: "Office", retailer: R.cape, price: 8700, styles: ["mid-century", "modern-luxury", "contemporary"], color: "#5d3f2a", size: { w: 1.4, d: 0.65, h: 0.75 }, rating: 4.5, leadTimeDays: 14 },
  { id: "p-rug-jute", name: "Hand-woven jute rug 2×3m", category: "Decor", subcategory: "Rugs", retailer: R.coast, price: 3900, styles: ["coastal", "farmhouse", "scandinavian", "afro-modern"], color: "#c8b08a", size: { w: 3, d: 2, h: 0.01 }, rating: 4.4, ecoRated: true, leadTimeDays: 7 },
  { id: "p-rug-wool", name: "Abstract wool rug 2.4×3.4m", category: "Decor", subcategory: "Rugs", retailer: R.cape, price: 8900, styles: ["contemporary", "modern-luxury", "minimalist"], color: "#9b9488", size: { w: 3.4, d: 2.4, h: 0.01 }, rating: 4.5, leadTimeDays: 10 },
  { id: "p-basket-set", name: "Zulu-woven basket wall set", category: "Decor", subcategory: "Wall decor", retailer: R.ubuntu, price: 2400, styles: ["afro-modern", "coastal", "farmhouse"], color: "#b88b4a", size: { w: 1.2, d: 0.05, h: 0.6 }, rating: 4.9, localMade: true, ecoRated: true, leadTimeDays: 5 },
  { id: "p-plant-fiddle", name: "Potted fiddle-leaf fig", category: "Decor", subcategory: "Plants", retailer: R.coast, price: 1450, styles: ["scandinavian", "coastal", "contemporary", "japandi"], color: "#4f7a4a", size: { w: 0.5, d: 0.5, h: 1.6 }, rating: 4.3, ecoRated: true, leadTimeDays: 3 },
  { id: "p-light-chandelier", name: "Brass tiered chandelier", category: "Lighting", subcategory: "Pendants", retailer: R.cape, price: 12900, styles: ["modern-luxury"], color: "#b08d57", size: { w: 0.8, d: 0.8, h: 0.7 }, rating: 4.6, leadTimeDays: 21 },
  { id: "p-light-paper", name: "Paper lantern pendant", category: "Lighting", subcategory: "Pendants", retailer: R.karoo, price: 1250, styles: ["japandi", "scandinavian", "minimalist"], color: "#f2ede2", size: { w: 0.6, d: 0.6, h: 0.5 }, rating: 4.4, leadTimeDays: 7 },
  { id: "p-light-edison", name: "Edison cage pendant trio", category: "Lighting", subcategory: "Pendants", retailer: R.highveld, price: 2100, styles: ["industrial", "farmhouse"], color: "#1f1f1f", size: { w: 0.9, d: 0.2, h: 0.4 }, rating: 4.1, leadTimeDays: 5 },
  { id: "p-light-led-down", name: "LED downlight 7W (10-pack)", category: "Lighting", subcategory: "Downlights", retailer: R.highveld, price: 1290, styles: ["minimalist", "contemporary", "modern-luxury", "scandinavian"], color: "#ffffff", size: { w: 0.1, d: 0.1, h: 0.05 }, rating: 4.5, ecoRated: true, leadTimeDays: 2 },
  { id: "p-light-rechargeable", name: "Rechargeable LED table lamp", category: "Lighting", subcategory: "Lamps", retailer: R.sol, price: 890, styles: ["minimalist", "contemporary", "japandi", "scandinavian"], color: "#d9d2c4", size: { w: 0.2, d: 0.2, h: 0.35 }, rating: 4.6, ecoRated: true, leadTimeDays: 2 },
  { id: "p-app-gashob", name: "5-burner gas hob", category: "Appliances", subcategory: "Cooking", retailer: R.highveld, price: 8900, styles: ["modern-luxury", "contemporary", "farmhouse", "industrial"], color: "#202020", size: { w: 0.9, d: 0.52, h: 0.1 }, rating: 4.6, leadTimeDays: 7 },
  { id: "p-app-oven", name: "Built-in multifunction oven", category: "Appliances", subcategory: "Cooking", retailer: R.highveld, price: 11400, styles: ["contemporary", "minimalist", "modern-luxury"], color: "#2b2b2b", size: { w: 0.6, d: 0.55, h: 0.6 }, rating: 4.5, leadTimeDays: 10 },
  { id: "p-app-fridge", name: "Inverter fridge/freezer 450L (A++)", category: "Appliances", subcategory: "Refrigeration", retailer: R.highveld, price: 15999, styles: ["contemporary", "minimalist", "modern-luxury", "scandinavian"], color: "#c9cacc", size: { w: 0.7, d: 0.7, h: 1.85 }, rating: 4.4, ecoRated: true, leadTimeDays: 5 },
  { id: "p-app-gasgeyser", name: "Gas instant water heater 16L", category: "Appliances", subcategory: "Water heating", retailer: R.sol, price: 7400, styles: [], color: "#eeeeee", size: { w: 0.35, d: 0.18, h: 0.6 }, rating: 4.3, ecoRated: true, leadTimeDays: 5 },
  { id: "p-fix-basin", name: "Vessel basin & mixer set", category: "Fixtures", subcategory: "Bathroom", retailer: R.highveld, price: 4600, styles: ["contemporary", "modern-luxury", "japandi"], color: "#f4f4f2", size: { w: 0.5, d: 0.4, h: 0.15 }, rating: 4.4, leadTimeDays: 7 },
  { id: "p-fix-vanity", name: "Floating oak vanity 900mm", category: "Fixtures", subcategory: "Bathroom", retailer: R.karoo, price: 9200, styles: ["scandinavian", "japandi", "contemporary"], color: "#b78f60", size: { w: 0.9, d: 0.46, h: 0.5 }, rating: 4.6, localMade: true, leadTimeDays: 21 },
  { id: "p-fix-shower", name: "Rain shower set (low-flow)", category: "Fixtures", subcategory: "Bathroom", retailer: R.highveld, price: 5200, styles: ["contemporary", "modern-luxury", "minimalist", "industrial"], color: "#1c1c1c", size: { w: 0.3, d: 0.3, h: 2.1 }, rating: 4.5, ecoRated: true, leadTimeDays: 7 },
  { id: "p-fix-bath", name: "Freestanding stone-resin bath", category: "Fixtures", subcategory: "Bathroom", retailer: R.cape, price: 21900, styles: ["modern-luxury", "contemporary", "japandi"], color: "#f6f5f2", size: { w: 1.7, d: 0.8, h: 0.6 }, rating: 4.7, leadTimeDays: 28 },
  { id: "p-fix-sink", name: "Fireclay farmhouse sink", category: "Fixtures", subcategory: "Kitchen", retailer: R.coast, price: 7800, styles: ["farmhouse", "coastal"], color: "#f7f7f4", size: { w: 0.8, d: 0.5, h: 0.25 }, rating: 4.5, leadTimeDays: 14 },
  { id: "p-fix-island", name: "Kitchen island 2.4m (carcass)", category: "Furniture", subcategory: "Kitchen", retailer: R.karoo, price: 22000, styles: ["modern-luxury", "contemporary", "farmhouse", "scandinavian"], color: "#e8e2d6", size: { w: 2.4, d: 1.0, h: 0.9 }, rating: 4.4, localMade: true, leadTimeDays: 35 },
  { id: "p-bm-paint", name: "Low-VOC acrylic paint 20L", category: "Building materials", subcategory: "Paint", retailer: R.highveld, price: 1650, styles: [], color: "#f3efe7", size: { w: 0.3, d: 0.3, h: 0.4 }, rating: 4.5, ecoRated: true, leadTimeDays: 1 },
  { id: "p-bm-tileadhesive", name: "Tile adhesive 20kg", category: "Building materials", subcategory: "Tiling", retailer: R.highveld, price: 185, styles: [], color: "#9a9a9a", size: { w: 0.4, d: 0.1, h: 0.6 }, rating: 4.2, leadTimeDays: 1 },
  { id: "p-bm-insulation", name: "Ceiling insulation roll 135mm", category: "Building materials", subcategory: "Insulation", retailer: R.highveld, price: 760, styles: [], color: "#f1d48a", size: { w: 1.2, d: 0.5, h: 0.5 }, rating: 4.6, ecoRated: true, leadTimeDays: 2 },
  { id: "p-en-inverter", name: "5kW hybrid inverter", category: "Energy", subcategory: "Backup power", retailer: R.sol, price: 21500, styles: [], color: "#e5e5e5", size: { w: 0.45, d: 0.15, h: 0.55 }, rating: 4.6, ecoRated: true, leadTimeDays: 5 },
  { id: "p-en-battery", name: "5.12kWh LiFePO4 battery", category: "Energy", subcategory: "Backup power", retailer: R.sol, price: 28900, styles: [], color: "#d0d0d0", size: { w: 0.45, d: 0.2, h: 0.6 }, rating: 4.7, ecoRated: true, leadTimeDays: 5 },
  { id: "p-en-panel", name: "550W mono solar panel", category: "Energy", subcategory: "Solar", retailer: R.sol, price: 2650, styles: [], color: "#1a2740", size: { w: 1.13, d: 0.03, h: 2.28 }, rating: 4.5, ecoRated: true, leadTimeDays: 5 },
];

export const PROVINCES: { name: string; costFactor: number; sunHours: number }[] = [
  { name: "Gauteng", costFactor: 1.0, sunHours: 5.5 },
  { name: "Western Cape", costFactor: 1.08, sunHours: 5.2 },
  { name: "KwaZulu-Natal", costFactor: 0.97, sunHours: 4.9 },
  { name: "Eastern Cape", costFactor: 0.93, sunHours: 5.0 },
  { name: "Free State", costFactor: 0.9, sunHours: 5.8 },
  { name: "Mpumalanga", costFactor: 0.92, sunHours: 5.4 },
  { name: "Limpopo", costFactor: 0.88, sunHours: 5.9 },
  { name: "North West", costFactor: 0.9, sunHours: 5.9 },
  { name: "Northern Cape", costFactor: 0.95, sunHours: 6.3 },
];

export interface Contractor {
  id: string;
  name: string;
  trades: string[];
  provinces: string[];
  rating: number;
  reviews: number;
  yearsActive: number;
  verified: boolean;
  priceLevel: 1 | 2 | 3;
  responseHours: number;
  bio: string;
}

export const CONTRACTORS: Contractor[] = [
  { id: "c-1", name: "Meridian Build & Renovate", trades: ["General building", "Kitchens", "Bathrooms"], provinces: ["Gauteng", "North West"], rating: 4.8, reviews: 214, yearsActive: 14, verified: true, priceLevel: 2, responseHours: 6, bio: "Full-service renovation team specialising in kitchen and bathroom remodels with fixed-price quotes." },
  { id: "c-2", name: "Atlantic Interiors Studio", trades: ["Interior design", "Joinery", "Kitchens"], provinces: ["Western Cape"], rating: 4.9, reviews: 132, yearsActive: 11, verified: true, priceLevel: 3, responseHours: 12, bio: "Interior architects delivering turnkey luxury interiors on the Atlantic Seaboard and Winelands." },
  { id: "c-3", name: "Umhlanga Tiling Co.", trades: ["Tiling", "Waterproofing", "Bathrooms"], provinces: ["KwaZulu-Natal"], rating: 4.6, reviews: 98, yearsActive: 9, verified: true, priceLevel: 1, responseHours: 4, bio: "Tile setting, screeds and waterproofing for wet areas and pool surrounds." },
  { id: "c-4", name: "SunVolt Installations", trades: ["Solar & backup power", "Electrical"], provinces: ["Gauteng", "Free State", "Mpumalanga", "Limpopo"], rating: 4.7, reviews: 301, yearsActive: 8, verified: true, priceLevel: 2, responseHours: 3, bio: "Accredited PV GreenCard installers for inverter, battery and rooftop solar systems with CoC." },
  { id: "c-5", name: "Karoo Joinery Works", trades: ["Joinery", "Built-in cupboards", "Flooring"], provinces: ["Eastern Cape", "Western Cape", "Northern Cape"], rating: 4.7, reviews: 76, yearsActive: 19, verified: true, priceLevel: 2, responseHours: 24, bio: "Hand-built cabinetry, staircases and solid timber floors from local and reclaimed timbers." },
  { id: "c-6", name: "BrightSpark Electrical", trades: ["Electrical", "Lighting design"], provinces: ["Gauteng", "KwaZulu-Natal"], rating: 4.5, reviews: 157, yearsActive: 7, verified: true, priceLevel: 1, responseHours: 2, bio: "Registered electricians for rewiring, DB boards, smart lighting and certificates of compliance." },
  { id: "c-7", name: "Painted Earth Decorators", trades: ["Painting", "Plastering", "Limewash"], provinces: ["Western Cape", "Gauteng"], rating: 4.4, reviews: 63, yearsActive: 6, verified: false, priceLevel: 1, responseHours: 8, bio: "Interior and exterior painting, decorative limewash and Venetian plaster finishes." },
  { id: "c-8", name: "Bushveld Plumbing & Gas", trades: ["Plumbing", "Gas installation", "Bathrooms"], provinces: ["Limpopo", "Mpumalanga", "North West"], rating: 4.6, reviews: 88, yearsActive: 12, verified: true, priceLevel: 1, responseHours: 5, bio: "Registered plumbers and LP-gas installers: geysers, gas hobs, water-saving retrofits." },
];

export const CURRENCIES: Record<string, { symbol: string; perZar: number; locale: string }> = {
  ZAR: { symbol: "R", perZar: 1, locale: "en-ZA" },
  USD: { symbol: "$", perZar: 0.055, locale: "en-US" },
  EUR: { symbol: "€", perZar: 0.05, locale: "de-DE" },
  GBP: { symbol: "£", perZar: 0.043, locale: "en-GB" },
  NGN: { symbol: "₦", perZar: 84, locale: "en-NG" },
  KES: { symbol: "KSh", perZar: 7.1, locale: "en-KE" },
  BWP: { symbol: "P", perZar: 0.75, locale: "en-BW" },
  NAD: { symbol: "N$", perZar: 1, locale: "en-NA" },
  AUD: { symbol: "A$", perZar: 0.083, locale: "en-AU" },
};

export const PLANS = {
  free: { name: "Free", priceZar: 0, monthlyGenerations: 5, maxProjects: 3, hdRenders: false, workspace: false },
  premium: { name: "Premium", priceZar: 189, monthlyGenerations: 100, maxProjects: 50, hdRenders: true, workspace: false },
  pro: { name: "Professional", priceZar: 649, monthlyGenerations: 1000, maxProjects: 1000, hdRenders: true, workspace: true },
} as const;

export type PlanId = keyof typeof PLANS;

export const VAT_RATE = 0.15;
