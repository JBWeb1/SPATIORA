import { PROVINCES } from "../data/catalog.js";

export interface Appliance {
  name: string;
  watts: number;
  hoursPerDay: number;
  quantity: number;
  essential: boolean;
}

export interface EnergyInput {
  province: string;
  appliances: Appliance[];
  loadsheddingHours: number; // longest outage to cover, hours/day
  tariff: number;            // R per kWh
  wantSolar: boolean;
}

export const DEFAULT_APPLIANCES: Appliance[] = [
  { name: "LED lights", watts: 7, hoursPerDay: 6, quantity: 12, essential: true },
  { name: "Wi-Fi router & fibre ONT", watts: 20, hoursPerDay: 24, quantity: 1, essential: true },
  { name: "TV & decoder", watts: 120, hoursPerDay: 5, quantity: 1, essential: true },
  { name: "Fridge/freezer", watts: 150, hoursPerDay: 10, quantity: 1, essential: true },
  { name: "Laptop", watts: 65, hoursPerDay: 8, quantity: 2, essential: true },
  { name: "Gate motor & alarm", watts: 60, hoursPerDay: 24, quantity: 1, essential: true },
  { name: "Kettle", watts: 2200, hoursPerDay: 0.3, quantity: 1, essential: false },
  { name: "Geyser (electric)", watts: 3000, hoursPerDay: 3, quantity: 1, essential: false },
  { name: "Washing machine", watts: 500, hoursPerDay: 1, quantity: 1, essential: false },
];

const PRICE = { inverterPerKva: 4300, batteryPerKwh: 5650, panel550: 2650, installBase: 9500, installPerPanel: 650 };

const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

export function planEnergy(input: EnergyInput) {
  const sun = PROVINCES.find((p) => p.name === input.province)?.sunHours ?? 5.5;
  const dailyKwh = input.appliances.reduce((s, a) => s + (a.watts * a.hoursPerDay * a.quantity) / 1000, 0);
  const essentials = input.appliances.filter((a) => a.essential);
  const essentialPeakW = essentials.reduce((s, a) => s + a.watts * a.quantity, 0);
  const essentialAvgW = essentials.reduce((s, a) => s + (a.watts * a.quantity * Math.min(a.hoursPerDay, 24)) / 24, 0);

  // Inverter: cover essential peak with 25% headroom, round up to standard sizes.
  const sizes = [3, 5, 8, 10, 12, 16];
  const neededKva = (essentialPeakW * 1.25) / 1000 / 0.8;
  const inverterKva = sizes.find((s) => s >= neededKva) ?? Math.ceil(neededKva);

  // Battery: essential average load across the outage window, LiFePO4 at 80% depth of discharge.
  const backupKwh = (essentialAvgW * input.loadsheddingHours) / 1000;
  const batteryKwh = Math.max(2.4, Math.ceil((backupKwh / 0.8) / 2.56) * 2.56);

  // Solar: offset ~70% of daily use, 550W panels, 80% system efficiency.
  const panelDailyKwh = 0.55 * sun * 0.8;
  const panels = input.wantSolar ? Math.max(4, Math.ceil((dailyKwh * 0.7) / panelDailyKwh)) : 0;
  const solarKwp = round(panels * 0.55, 2);
  const solarDailyKwh = panels * panelDailyKwh;

  const cost = {
    inverter: Math.round(inverterKva * PRICE.inverterPerKva),
    battery: Math.round(batteryKwh * PRICE.batteryPerKwh),
    panels: panels * PRICE.panel550,
    installation: PRICE.installBase + panels * PRICE.installPerPanel,
  };
  const totalCost = cost.inverter + cost.battery + cost.panels + cost.installation;
  const monthlySavings = Math.round(Math.min(solarDailyKwh, dailyKwh) * 30 * input.tariff);
  const paybackYears = monthlySavings > 0 ? round(totalCost / (monthlySavings * 12)) : null;

  const tips: string[] = [];
  const geyser = input.appliances.find((a) => /geyser/i.test(a.name));
  if (geyser) tips.push("Fit a geyser timer or blanket, or switch to a solar/heat-pump geyser — water heating is often 30–50% of a household bill.");
  if (input.appliances.some((a) => /kettle|oven|hob|stove/i.test(a.name) && a.essential)) tips.push("Keep high-draw cooking appliances off the backup circuit; a gas hob keeps the kitchen running during load-shedding.");
  if (input.appliances.some((a) => /light|bulb/i.test(a.name) && a.watts > 15)) tips.push("Swap remaining incandescent/halogen lamps for LED to cut lighting use by up to 85%.");
  tips.push("Ceiling insulation (SANS 10400-XA) reduces heating/cooling loads and makes backup batteries last longer.");
  tips.push("Use a registered installer who can issue an electrical CoC and register the system with your municipality.");

  return {
    sunHours: sun,
    dailyKwh: round(dailyKwh, 2),
    monthlyKwh: Math.round(dailyKwh * 30),
    monthlyBill: Math.round(dailyKwh * 30 * input.tariff),
    essentialPeakW: Math.round(essentialPeakW),
    backupKwh: round(backupKwh, 2),
    system: { inverterKva, batteryKwh: round(batteryKwh, 2), panels, solarKwp, solarDailyKwh: round(solarDailyKwh, 1) },
    cost: { ...cost, total: totalCost },
    monthlySavings,
    paybackYears,
    co2SavedKgPerYear: Math.round(Math.min(solarDailyKwh, dailyKwh) * 365 * 0.95), // ~0.95 kg CO2/kWh (coal-heavy grid)
    tips,
  };
}
