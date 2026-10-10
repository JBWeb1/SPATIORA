export type PlanId = "free" | "premium" | "pro";

export interface User {
  id: string;
  email: string;
  name: string;
  plan: PlanId;
  planDetails: Plan;
  accountType: "homeowner" | "designer" | "contractor" | "developer";
  company: string | null;
  currency: string;
  province: string;
  styleProfile: StyleProfile | null;
  createdAt: string;
  isAdmin?: boolean;
}

export interface AppNotification {
  id: string;
  kind: "comment" | "price-drop" | "quote" | "contractor" | "system";
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface StyleProfile {
  primary: string;
  secondary?: string;
  scores: Record<string, number>;
  palette?: string[];
}

export interface Plan {
  name: string;
  priceZar: number;
  monthlyGenerations: number;
  maxProjects: number;
  hdRenders: boolean;
  workspace: boolean;
}

export interface DesignStyle {
  id: string;
  name: string;
  tagline: string;
  palette: string[];
  materials: string[];
  keywords: string[];
}

export interface Material {
  id: string;
  category: "flooring" | "wall" | "ceiling" | "tiles" | "countertop" | "cabinetry";
  name: string;
  color: string;
  unit: string;
  price: number;
  labourPerUnit: number;
  roughness?: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  retailer: string;
  price: number;
  styles: string[];
  color: string;
  size: { w: number; d: number; h: number };
  rating: number;
  ecoRated?: boolean;
  localMade?: boolean;
  leadTimeDays: number;
}

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

export interface Appliance {
  name: string;
  watts: number;
  hoursPerDay: number;
  quantity: number;
  essential: boolean;
}

export interface Catalog {
  roomTypes: string[];
  styles: DesignStyle[];
  materials: Material[];
  provinces: { name: string; costFactor: number; sunHours: number }[];
  currencies: Record<string, { symbol: string; perZar: number; locale: string }>;
  plans: Record<PlanId, Plan>;
  vatRate: number;
  defaultAppliances: Appliance[];
  capabilities: { imageProvider: string; assistant: string };
  dataStatus?: {
    fx: import("./updater").DataFeedStatus;
    catalog: import("./updater").DataFeedStatus & { products: number };
  };
}

export interface Room {
  length: number;
  width: number;
  height: number;
  doors: number;
  windows: number;
}

export interface LayoutItem {
  id: string;
  productId?: string;
  name: string;
  color: string;
  x: number;
  z: number;
  rotation: number;
  w: number;
  d: number;
  h: number;
}

export interface MoodItem {
  id: string;
  kind: "color" | "material" | "product" | "image" | "note";
  value: string;
  label?: string;
}

export type Finishes = Record<string, string | number | null | undefined>;

export interface Project {
  id: string;
  clientId: string | null;
  name: string;
  roomType: string;
  description: string | null;
  status: "planning" | "designing" | "quoting" | "in-progress" | "complete";
  budget: number;
  currency: string;
  sourceImage: string | null;
  coverImage: string | null;
  room: Room;
  layout: LayoutItem[];
  finishes: Finishes;
  moodboard: MoodItem[];
  tags: string[];
  shareToken: string | null;
  createdAt: string;
  updatedAt: string;
  designCount?: number;
}

export interface Design {
  id: string;
  projectId: string;
  style: string;
  prompt: string;
  preferences: Record<string, unknown>;
  sourceImage: string | null;
  resultImage: string;
  provider: string;
  favorite: boolean;
  notes: string | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  designId: string | null;
  authorName: string;
  body: string;
  reaction: string | null;
  createdAt: string;
  isOwner: number;
}

export interface ShoppingItem {
  id: string;
  quantity: number;
  purchased: boolean;
  product: Product;
}

export interface Task {
  id: string;
  title: string;
  phase: string;
  startDate: string | null;
  endDate: string | null;
  status: "todo" | "doing" | "done" | "blocked";
  estimatedCost: number;
  actualCost: number;
  assignee: string | null;
}

export interface EstimateLine {
  group: string;
  item: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

export interface Estimate {
  geometry: { floorArea: number; perimeter: number; wallArea: number; ceilingArea: number };
  quantities: { item: string; quantity: number; unit: string; note: string }[];
  lines: EstimateLine[];
  totals: { materials: number; labour: number; services: number; subtotal: number; contingency: number; vat: number; total: number };
  range: { low: number; high: number };
  assumptions: string[];
}

export interface Client {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  projectCount?: number;
  quoteCount?: number;
}

export interface QuoteItem {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  category: string;
}

export interface Quote {
  id: string;
  number: string;
  title: string;
  projectId: string | null;
  clientId: string | null;
  clientName: string | null;
  projectName: string | null;
  items: QuoteItem[];
  vatRate: number;
  markup: number;
  currency: string;
  status: "draft" | "sent" | "accepted" | "declined";
  notes: string | null;
  validUntil: string | null;
  createdAt: string;
  totals: { subtotal: number; markup: number; vat: number; total: number };
}
