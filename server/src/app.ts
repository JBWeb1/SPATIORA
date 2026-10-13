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
import { dataStatus } from "./services/liveData.js";
import { engagementRouter } from "./routes/engagement.js";
import { adminRouter } from "./routes/admin.js";
import { organiseRouter } from "./routes/organise.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "..", "..", "client", "dist");
const startedAt = new Date().toISOString();
const appVersion = (() => {
  try { return (JSON.parse(fs.readFileSync(path.resolve(here, "..", "..", "package.json"), "utf8")) as { version: string }).version; } catch { return "0.0.0"; }
})();

/** Build id of the web client currently on disk (changes on every deploy). */
function clientBuild(): { build: string; builtAt: string | null } {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(clientDist, "version.json"), "utf8")) as { build: string; builtAt: string };
    return { build: v.build, builtAt: v.builtAt };
  } catch {
    return { build: "dev", builtAt: null };
  }
}

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
  // Polled by the web client to discover new releases and data refreshes.
  app.get("/api/version", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ version: appVersion, ...clientBuild(), serverStartedAt: startedAt, data: dataStatus() });
  });
  app.use("/api/auth", authRouter);
  app.use("/api", catalogRouter);
  app.use("/api", shareRouter);
  app.use("/api", toolsRouter);
  app.use("/api", projectsRouter);
  app.use("/api", plannerRouter);
  app.use("/api", assistantRouter);
  app.use("/api", workspaceRouter);
  app.use("/api", engagementRouter);
  app.use("/api", adminRouter);
  app.use("/api", organiseRouter);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Endpoint not found")));

  // In production, serve the built React client.
  if (fs.existsSync(clientDist)) {
    // Hashed assets are immutable; the shell, service worker and version file must always revalidate.
    app.use(express.static(clientDist, {
      index: false,
      setHeaders: (res, file) => {
        res.setHeader("Cache-Control", file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
      },
    }));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => { res.setHeader("Cache-Control", "no-cache"); res.sendFile(path.join(clientDist, "index.html")); });
  }

  app.use(errorHandler);
  return app;
}
