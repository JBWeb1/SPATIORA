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
  claude: {
    enabled: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN),
    model: env.CLAUDE_MODEL || "claude-opus-5-5",
  },
  images: {
    replicateToken: env.REPLICATE_API_TOKEN || "",
    replicateVersion: env.REPLICATE_MODEL_VERSION || "",
    providerUrl: env.IMAGE_PROVIDER_URL || "",
    providerKey: env.IMAGE_PROVIDER_KEY || "",
  },
};

fs.mkdirSync(config.uploadDir, { recursive: true });
