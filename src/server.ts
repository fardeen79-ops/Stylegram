import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
import { ensureAdmin } from "./bootstrap.js";
import { config } from "./config.js";
import type { Ctx } from "./context.js";
import { openDb } from "./db.js";
import { seedDemo } from "./demo.js";

const db = openDb(config.dbPath);
const ctx: Ctx = { db, config, now: () => new Date() };

// Decide before creating the admin account whether this is a brand-new, empty database.
const freshDatabase = (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n === 0;

const { ADMIN_USERNAME, ADMIN_PASSWORD } = process.env;
if (ADMIN_USERNAME && ADMIN_PASSWORD) ensureAdmin(ctx, ADMIN_USERNAME, ADMIN_PASSWORD);
else if (config.production) console.warn("No ADMIN_USERNAME / ADMIN_PASSWORD set: nobody can verify brand accounts.");

const app = createApp(ctx);
const server = app.listen(config.port, () => {
  console.log(`Stylegram listening on port ${config.port} (data in ${config.dataDir})`);
  // Optional demo content on the first start. Runs after listening so health checks pass meanwhile.
  if (process.env.SEED_DEMO === "true" && freshDatabase) {
    const password = process.env.DEMO_PASSWORD || randomBytes(9).toString("base64url");
    seedDemo(ctx, { password })
      .then(() => console.log(`Demo content added. Demo accounts (maya.styles, leo_fits, sara.wears, northwind) use password: ${password}`))
      .catch((err) => console.error("Adding demo content failed:", err));
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
