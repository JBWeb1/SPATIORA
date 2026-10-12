import fs from "node:fs";
import path from "node:path";

// Load a .env file from the repo root or the server folder, if present.
for (const candidate of [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "..", ".env")]) {
  if (fs.existsSync(candidate)) {
    process.loadEnvFile(candidate);
    break;
  }
}

const env = process.env;
const isProd = env.NODE_ENV === "production";

if (isProd && (!env.JWT_SECRET || env.JWT_SECRET.length < 24)) {
  throw new Error("JWT_SECRET must be set to a value of at least 24 characters in production.");
}

const dataDir = path.resolve(env.DATA_DIR ?? path.resolve(process.cwd(), "data"));

export const config = {
  isProd,
  port: Number(env.PORT ?? 4000),
  jwtSecret: env.JWT_SECRET ?? "dev-only-secret",
  clientOrigin: env.CLIENT_ORIGIN ?? "http://localhost:5173",
  dataDir,
  uploadDir: path.join(dataDir, "uploads"),
  dbFile: path.join(dataDir, "vistora.db"),
  // Comma-separated emails that can open the admin dashboard.
  adminEmails: (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
  claude: {
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    model: env.CLAUDE_MODEL || "claude-opus-5-5",
  },
  liveData: {
    // Daily exchange rates quoted per 1 ZAR. Set to "off" to keep the built-in rates.
    fxUrl: env.FX_RATES_URL ?? "https://open.er-api.com/v6/latest/ZAR",
    fxHours: Number(env.FX_REFRESH_HOURS ?? 12),
    // Optional partner product feed: JSON { products: [...] } with full products or { id, price } updates.
    catalogUrl: env.CATALOG_FEED_URL || "",
    catalogHours: Number(env.CATALOG_REFRESH_HOURS ?? 6),
  },
  images: {
    replicateToken: env.REPLICATE_API_TOKEN || "",
    replicateVersion: env.REPLICATE_MODEL_VERSION || "",
    // Interior image-to-image model; its latest version is looked up automatically.
    replicateModel: env.REPLICATE_MODEL || "adirik/interior-design",
    replicateBase: (env.REPLICATE_API_BASE || "https://api.replicate.com/v1").replace(/\/$/, ""),
    providerUrl: env.IMAGE_PROVIDER_URL || "",
    providerKey: env.IMAGE_PROVIDER_KEY || "",
  },
};

fs.mkdirSync(config.uploadDir, { recursive: true });
