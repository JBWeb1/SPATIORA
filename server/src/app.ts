import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { errorHandler, HttpError } from "./lib/http.js";
import { authRouter } from "./routes/auth.js";
import { catalogRouter } from "./routes/catalog.js";
import { projectsRouter } from "./routes/projects.js";
import { plannerRouter } from "./routes/planner.js";
import { assistantRouter } from "./routes/assistant.js";
import { toolsRouter } from "./routes/tools.js";
import { shareRouter } from "./routes/share.js";
import { workspaceRouter } from "./routes/workspace.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(cors({ origin: config.isProd ? false : config.clientOrigin }));
  app.use(express.json({ limit: "2mb" }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    next();
  });

  // Uploaded photos and generated renders. Locked down so SVG renders can never run script.
  app.use("/uploads", (_req, res, next) => {
    res.setHeader("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    next();
  }, express.static(config.uploadDir, { fallthrough: false }));

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "vistora-api" }));
  app.use("/api/auth", authRouter);
  app.use("/api", catalogRouter);
  app.use("/api", shareRouter);
  app.use("/api", toolsRouter);
  app.use("/api", projectsRouter);
  app.use("/api", plannerRouter);
  app.use("/api", assistantRouter);
  app.use("/api", workspaceRouter);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Endpoint not found")));

  // In production, serve the built React client.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(here, "..", "..", "client", "dist");
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
  }

  app.use(errorHandler);
  return app;
}
