import type { Ctx } from "./context.js";
import { hashSecret, verifySecret } from "./security.js";

/**
 * Make sure the configured admin account exists (production). The account is created at
 * startup, before anyone can register the name. If the username is already taken, it is only
 * promoted when ADMIN_PASSWORD matches, so a stranger who grabbed the name is never made admin.
 */
export function ensureAdmin(ctx: Ctx, username: string, password: string, log = console): void {
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9._]{3,30}$/.test(name)) {
    log.error(`ADMIN_USERNAME "${username}" is not a valid username; no admin account was set up.`);
    return;
  }
  if (password.length < 12) {
    log.error("ADMIN_PASSWORD must be at least 12 characters; no admin account was set up.");
    return;
  }
  const existing = ctx.db.prepare("SELECT id, password_hash, is_admin FROM users WHERE username = ?").get(name) as
    | { id: number; password_hash: string; is_admin: number }
    | undefined;
  if (!existing) {
    ctx.db
      .prepare(
        `INSERT INTO users (username, email, password_hash, display_name, account_type, is_admin, created_at)
         VALUES (?, ?, ?, ?, 'PERSONAL', 1, ?)`,
      )
      .run(name, `${name}@admin.invalid`, hashSecret(password), "Admin", ctx.now().toISOString());
    log.log(`Created admin account "${name}".`);
  } else if (!existing.is_admin) {
    if (verifySecret(password, existing.password_hash)) {
      ctx.db.prepare("UPDATE users SET is_admin = 1 WHERE id = ?").run(existing.id);
      log.log(`Gave admin rights to existing account "${name}".`);
    } else {
      log.error(`Username "${name}" belongs to someone else (password doesn't match). Pick another ADMIN_USERNAME.`);
    }
  }
}
