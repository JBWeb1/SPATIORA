// Ready-made sample South African homes users can open and redesign straight away.
import type { House, HouseRoom } from "../shared/house.js";

export interface HouseTemplate {
  id: string;
  name: string;
  location: string;
  description: string;
  bedrooms: number;
  bathrooms: number;
  budget: number;           // ZAR, typical refresh budget
  style: string;
  finishes: Record<string, string | number>;
  house: Omit<House, "items">;
}

let n = 0;
const room = (name: string, type: string, x: number, z: number, length: number, width: number, extra: Partial<HouseRoom> = {}): HouseRoom =>
  ({ id: `r${++n}`, name, type, x, z, length, width, ...extra });

export const HOUSE_TEMPLATES: HouseTemplate[] = [
  {
    id: "family-3bed",
    name: "Family home — 3 bed, 2 bath",
    location: "Centurion, Gauteng",
    description: "A classic single-storey suburban family home with an open-plan living, dining and kitchen wing, a central passage and an en-suite main bedroom.",
    bedrooms: 3, bathrooms: 2, budget: 450000, style: "contemporary",
    finishes: { style: "contemporary", flooring: "floor-porcelain", wall: "wall-greige", ceiling: "ceiling-white", tiles: "tiles-marble", tiledArea: 6, countertop: "counter-quartz", countertopLength: 5, cabinetry: "cab-oak-flat", cabinetryLength: 6 },
    house: {
      height: 2.7,
      rooms: [
        room("Lounge", "Living room", 0, 0, 6, 5),
        room("Dining", "Dining room", 6, 0, 4, 5),
        room("Kitchen & scullery", "Kitchen", 10, 0, 6, 5),
        room("Passage", "Entrance & hallway", 0, 5, 16, 1.2),
        room("Main bedroom", "Bedroom", 0, 6.2, 4.5, 4, { floor: "floor-oak" }),
        room("En-suite", "Bathroom", 4.5, 6.2, 2.5, 4, { ensuite: true }),
        room("Bedroom 2", "Bedroom", 7, 6.2, 3.5, 4, { floor: "floor-oak" }),
        room("Family bathroom", "Bathroom", 10.5, 6.2, 2, 4),
        room("Bedroom 3", "Home office", 12.5, 6.2, 3.5, 4, { floor: "floor-oak" }),
        room("Patio & braai", "Patio & outdoor", 0, -3, 10, 3),
      ],
    },
  },
  {
    id: "townhouse-2bed",
    name: "Townhouse — 2 bed, 1 bath",
    location: "Durbanville, Western Cape",
    description: "A compact lock-up-and-go townhouse with an open-plan kitchen and lounge opening onto a small garden patio.",
    bedrooms: 2, bathrooms: 1, budget: 220000, style: "coastal",
    finishes: { style: "coastal", flooring: "floor-vinyl", wall: "wall-white", ceiling: "ceiling-white", tiles: "tiles-zellige", tiledArea: 4, countertop: "counter-quartz", countertopLength: 3.5, cabinetry: "cab-white-shaker", cabinetryLength: 4 },
    house: {
      height: 2.6,
      rooms: [
        room("Lounge", "Living room", 0, 0, 5, 4.5),
        room("Kitchen", "Kitchen", 5, 0, 3.5, 4.5),
        room("Passage", "Entrance & hallway", 0, 4.5, 8.5, 1.2),
        room("Main bedroom", "Bedroom", 0, 5.7, 4, 3.5),
        room("Bathroom", "Bathroom", 4, 5.7, 2, 3.5),
        room("Bedroom 2", "Bedroom", 6, 5.7, 2.5, 3.5),
        room("Garden patio", "Patio & outdoor", 0, -2.5, 5, 2.5),
      ],
    },
  },
  {
    id: "apartment-1bed",
    name: "Apartment — 1 bed, 1 bath",
    location: "Umhlanga, KwaZulu-Natal",
    description: "A sea-facing apartment with an open-plan living area, a balcony and a separate bedroom wing.",
    bedrooms: 1, bathrooms: 1, budget: 140000, style: "japandi",
    finishes: { style: "japandi", flooring: "floor-oak", wall: "wall-greige", ceiling: "ceiling-white", tiles: "tiles-subway", tiledArea: 4, countertop: "counter-quartz", countertopLength: 3, cabinetry: "cab-oak-flat", cabinetryLength: 3.5 },
    house: {
      height: 2.6,
      rooms: [
        room("Living", "Living room", 0, 0, 5.5, 4.5),
        room("Kitchen", "Kitchen", 5.5, 0, 2.5, 4.5),
        room("Bedroom", "Bedroom", 0, 4.5, 4, 3.5),
        room("Hall", "Entrance & hallway", 4, 4.5, 1.2, 3.5),
        room("Bathroom", "Bathroom", 5.2, 4.5, 2.8, 3.5),
        room("Balcony", "Patio & outdoor", 0, -1.8, 5.5, 1.8),
      ],
    },
  },
  {
    id: "starter-2bed",
    name: "Starter home — 2 bed, 45 m²",
    location: "Soshanguve, Gauteng",
    description: "A compact starter home. Smart layouts, durable finishes and budget-friendly upgrades make it feel much bigger.",
    bedrooms: 2, bathrooms: 1, budget: 80000, style: "afro-modern",
    finishes: { style: "afro-modern", flooring: "floor-vinyl", wall: "wall-white", ceiling: "ceiling-white", tiles: "tiles-subway", tiledArea: 3, countertop: "counter-butcher", countertopLength: 2.4, cabinetry: "cab-white-shaker", cabinetryLength: 2.4 },
    house: {
      height: 2.5,
      rooms: [
        room("Living", "Living room", 0, 0, 4, 3.5),
        room("Kitchen", "Kitchen", 4, 0, 3, 3.5),
        room("Bedroom 1", "Bedroom", 0, 3.5, 3, 3),
        room("Bathroom", "Bathroom", 3, 3.5, 1.5, 3),
        room("Bedroom 2", "Bedroom", 4.5, 3.5, 2.5, 3),
        room("Stoep", "Patio & outdoor", 0, -2, 4, 2),
      ],
    },
  },
];
