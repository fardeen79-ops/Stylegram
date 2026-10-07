import { randomBytes } from "node:crypto";

function jwtSecret(): string {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("JWT_SECRET must be set in production");
  // Dev fallback: tokens are invalidated on restart.
  return randomBytes(32).toString("hex");
}

export const config = {
  port: Number(process.env.PORT ?? 3002),
  dbPath: process.env.DB_PATH ?? "stylegram.db",
  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  jwtSecret: jwtSecret(),
  jwtTtl: process.env.JWT_TTL ?? "7d",
  /** Usernames that get admin rights (brand verification and claims) when they register. */
  adminUsernames: (process.env.ADMIN_USERNAMES ?? "admin")
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
