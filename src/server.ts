import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { createApp } from "./app.js";
import { ensureAdmin } from "./bootstrap.js";
import { config } from "./config.js";
import type { Ctx } from "./context.js";
import { openDb } from "./db.js";
import { repairDemoPhotos, seedDemo } from "./demo.js";
import { ClaudeImageAI } from "./ai.js";
import { ClaudeTranslator } from "./translate.js";

// Log anything unexpected with a clear message instead of dying silently.
process.on("unhandledRejection", (err) => console.error("Unhandled error (the server keeps running):", err));
process.on("uncaughtException", (err) => {
  console.error("Fatal error, restarting:", err);
  process.exit(1);
});

// Small instances: keep image processing lean.
sharp.cache(false);
sharp.concurrency(1);

if (!config.persistentStorage) {
  console.warn(
    "WARNING: No volume attached. Posts, photos and accounts are stored temporarily and will be LOST on the next deploy. " +
      "On Railway: right-click the service → Attach volume → mount path /data.",
  );
}

const db = openDb(config.dbPath);
// Photo safety checks and item suggestions need an Anthropic API key.
const ai = process.env.ANTHROPIC_API_KEY ? new ClaudeImageAI(config.ai.model) : undefined;
if (!ai) {
  console.warn(
    "WARNING: ANTHROPIC_API_KEY is not set. Uploads are NOT checked for nudity or sexual content, and AI item suggestions and translation are off.",
  );
}
const translator = process.env.ANTHROPIC_API_KEY ? new ClaudeTranslator(config.ai.model) : undefined;
const ctx: Ctx = { db, config, now: () => new Date(), ai, translator };

// Decide before creating the admin account whether this is a brand-new, empty database.
const freshDatabase = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n === 0;

const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
if (ADMIN_USERNAME && ADMIN_PASSWORD) ensureAdmin(ctx, ADMIN_USERNAME, ADMIN_PASSWORD);
else if (config.production) console.warn("No ADMIN_USERNAME / ADMIN_PASSWORD set: nobody can verify brand accounts.");

const app = createApp(ctx);
const server = app.listen(config.port, () => {
  console.log(`Copp IT listening on port ${config.port} (data in ${config.dataDir})`);
  // Optional demo content on the first start. Runs after listening so health checks pass meanwhile.
  if (process.env.SEED_DEMO === "true" && freshDatabase) {
    const password = process.env.DEMO_PASSWORD || randomBytes(9).toString("base64url");
    seedDemo(ctx, { password })
      .then(() => console.log(`Demo content added. Demo accounts (noor.styles, omar.fits, priya.wears, creekdenim) use password: ${password}`))
      .catch((err) => console.error("Adding demo content failed:", err));
  } else if (process.env.SEED_DEMO === "true") {
    repairDemoPhotos(ctx).catch((err) => console.error("Retrying demo photos failed:", err));
  }
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
