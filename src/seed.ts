/**
 * Local demo data: `npm run seed` on an empty database. Creates the demo accounts plus an
 * "admin" account; every password is "password123" (for local use only).
 */
import { config } from "./config.js";
import type { Ctx } from "./context.js";
import { openDb } from "./db.js";
import { seedDemo } from "./demo.js";
import { registerUser } from "./services/users.js";

const PASSWORD = "password123";
const ctx: Ctx = { db: openDb(config.dbPath), config: { ...config, adminUsernames: ["admin"] }, now: () => new Date() };
if ((ctx.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n > 0) {
  console.error(`${config.dbPath} already has data; seed an empty database (set DB_PATH or delete the file).`);
  process.exit(1);
}
registerUser(ctx, { username: "admin", email: "admin@example.com", password: PASSWORD, displayName: "Admin", accountType: "PERSONAL" });
await seedDemo(ctx, { password: PASSWORD });
console.log(`Seeded ${config.dbPath}. Log in as noor.styles, omar.fits, priya.wears, creekdenim (brand) or admin — password: ${PASSWORD}`);
