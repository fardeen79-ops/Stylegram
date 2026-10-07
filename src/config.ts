import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const production = process.env.NODE_ENV === "production";

/**
 * Where the database and uploaded photos live. On Railway this is the attached volume
 * (Railway sets RAILWAY_VOLUME_MOUNT_PATH automatically); locally it's the project folder.
 */
const dataDir = process.env.DATA_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH ?? ".";

/** False when running in production with nowhere durable to keep data (no volume / DATA_DIR / DB_PATH). */
const persistentStorage = !production || dataDir !== "." || Boolean(process.env.DB_PATH);

/** Read a generated secret from `file`, creating it on first use (mode 600). */
function persistedSecret(file: string): string {
  if (existsSync(file)) return readFileSync(file, "utf8").trim();
  mkdirSync(dirname(file), { recursive: true });
  const secret = randomBytes(32).toString("hex");
  writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return randomBytes(32).toString("hex");
  if (production) {
    // No JWT_SECRET set: keep a generated one on the persistent data volume, never in the image.
    // Without a volume (e.g. the first Railway deploy, before one is attached) start anyway with a
    // temporary secret; server.ts logs a loud warning that data won't survive a redeploy.
    if (!persistentStorage) return randomBytes(32).toString("hex");
    return persistedSecret(join(dataDir, ".jwt-secret"));
  }
  // Development: a git-ignored local file, so restarts don't log everyone out.
  try {
    return persistedSecret(".jwt-secret");
  } catch {
    return randomBytes(32).toString("hex");
  }
}

export const config = {
  production,
  persistentStorage,
  port: Number(process.env.PORT ?? 3002),
  dataDir,
  dbPath: process.env.DB_PATH ?? join(dataDir, "stylegram.db"),
  uploadDir: process.env.UPLOAD_DIR ?? join(dataDir, "uploads"),
  jwtSecret: jwtSecret(),
  jwtTtl: process.env.JWT_TTL ?? "7d",
  /**
   * Development only: usernames that get admin rights when they register. Never used in
   * production, where anyone could register the name first; there the admin account is
   * created at startup from ADMIN_USERNAME / ADMIN_PASSWORD instead (see bootstrap.ts).
   */
  adminUsernames: production
    ? []
    : (process.env.ADMIN_USERNAMES ?? "admin")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
  upload: {
    maxFileBytes: 10 * 1024 * 1024,
    maxImagesPerPost: 10,
    maxTagsPerImage: 20,
    fullWidth: 1440,
    thumbSize: 480,
  },
  /** Appended to outbound product links so brands can attribute traffic. */
  utmSource: process.env.UTM_SOURCE ?? "stylegram",
};

export type Config = typeof config;
