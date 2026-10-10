import { Router } from "express";
import { z } from "zod";
import { PROVINCES } from "../data/catalog.js";
import { requireAuth } from "../lib/auth.js";
import { estimate } from "../services/estimator.js";
import { planEnergy } from "../services/energy.js";

export const toolsRouter = Router();

const appliance = z.object({
  name: z.string().max(80),
  watts: z.number().min(0).max(20000),
  hoursPerDay: z.number().min(0).max(24),
  quantity: z.number().int().min(0).max(100),
  essential: z.boolean(),
});

toolsRouter.post("/energy/plan", requireAuth, (req, res) => {
  const b = z.object({
    province: z.string().refine((p) => PROVINCES.some((x) => x.name === p)),
    appliances: z.array(appliance).max(60),
    loadsheddingHours: z.number().min(0).max(24).default(4),
    tariff: z.number().min(0.5).max(20).default(3.5),
    wantSolar: z.boolean().default(true),
  }).parse(req.body);
  res.json({ plan: planEnergy(b) });
});

// Stateless quick estimate (used by the public landing-page calculator).
toolsRouter.post("/estimate/quick", (req, res) => {
  const b = z.object({
    length: z.number().min(1).max(40), width: z.number().min(1).max(40), height: z.number().min(2).max(8).default(2.7),
    flooring: z.string().optional(), wall: z.string().optional(),
    quality: z.enum(["budget", "standard", "premium"]).default("standard"),
    province: z.string().default("Gauteng"),
  }).parse(req.body);
  const result = estimate({ length: b.length, width: b.width, height: b.height, doors: 1, windows: 2 },
    { flooring: b.flooring ?? "floor-vinyl", wall: b.wall ?? "wall-white", ceiling: "ceiling-white" },
    { quality: b.quality, province: b.province, includeDemolition: false, electricalPoints: 0, plumbingPoints: 0, contingency: 0.1 });
  res.json({ estimate: result });
});
