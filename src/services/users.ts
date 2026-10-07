import type { Ctx } from "../context.js";
import { AppError } from "../errors.js";
import { mediaUrl } from "../media.js";
import { hashSecret, verifySecret } from "../security.js";
import { slugify } from "../util.js";

export interface UserRow {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  account_type: "PERSONAL" | "BRAND";
  is_admin: number;
  created_at: string;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  displayName: string;
  accountType: "PERSONAL" | "BRAND";
  brand?: { name: string; website: string; message?: string };
}

/**
 * Register a user. A BRAND account either creates its brand (unverified until an admin
 * verifies it) or, if the brand already exists, files a claim for it.
 */
export function registerUser(ctx: Ctx, input: RegisterInput): { user: UserRow; brand?: { slug: string; status: string } } {
  const { db } = ctx;
  if (db.prepare("SELECT 1 FROM users WHERE username = ?").get(input.username)) {
    throw new AppError("CONFLICT", "That username is taken");
  }
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(input.email)) {
    throw new AppError("CONFLICT", "An account with this email already exists");
  }
  if (input.accountType === "BRAND" && !input.brand) {
    throw new AppError("VALIDATION_ERROR", "Brand accounts need a brand name and website");
  }
  const now = ctx.now().toISOString();
  const run = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO users (username, email, password_hash, display_name, account_type, is_admin, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.username,
        input.email,
        hashSecret(input.password),
        input.displayName,
        input.accountType,
        ctx.config.adminUsernames.includes(input.username) ? 1 : 0,
        now,
      );
    const userId = Number(info.lastInsertRowid);
    if (!input.brand || input.accountType !== "BRAND") return { userId };

    const slug = slugify(input.brand.name);
    if (!slug) throw new AppError("VALIDATION_ERROR", "Invalid brand name");
    const existing = db.prepare("SELECT id, owner_id FROM brands WHERE slug = ?").get(slug) as
      | { id: number; owner_id: number | null }
      | undefined;
    if (existing) {
      if (existing.owner_id !== null) throw new AppError("CONFLICT", `${input.brand.name} already has a brand account`);
      db.prepare("INSERT INTO brand_claims (brand_id, user_id, message, status, created_at) VALUES (?, ?, ?, 'PENDING', ?)").run(
        existing.id,
        userId,
        input.brand.message ?? "",
        now,
      );
      return { userId, brand: { slug, status: "CLAIM_PENDING" } };
    }
    db.prepare(
      "INSERT INTO brands (slug, name, website, owner_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).run(slug, input.brand.name, input.brand.website, userId, userId, now);
    return { userId, brand: { slug, status: "VERIFICATION_PENDING" } };
  });
  const { userId, brand } = run();
  return { user: getUser(ctx, userId), brand };
}

export function authenticate(ctx: Ctx, login: string, password: string): UserRow {
  const user = ctx.db.prepare("SELECT * FROM users WHERE username = ? OR email = ?").get(login, login) as UserRow | undefined;
  if (!user || !verifySecret(password, user.password_hash)) throw new AppError("UNAUTHORIZED", "Wrong username or password");
  return user;
}

export function getUser(ctx: Ctx, id: number): UserRow {
  const u = ctx.db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (!u) throw new AppError("NOT_FOUND", "User not found");
  return u;
}

export function getUserByUsername(ctx: Ctx, username: string): UserRow {
  const u = ctx.db.prepare("SELECT * FROM users WHERE username = ?").get(username.toLowerCase()) as UserRow | undefined;
  if (!u) throw new AppError("NOT_FOUND", "User not found");
  return u;
}

/** Compact author info embedded in posts and comments. */
export function userSummary(ctx: Ctx, u: UserRow) {
  const brand = ctx.db.prepare("SELECT slug, verified FROM brands WHERE owner_id = ?").get(u.id) as
    | { slug: string; verified: number }
    | undefined;
  return {
    username: u.username,
    displayName: u.display_name,
    avatarUrl: mediaUrl(u.avatar_path),
    brand: brand ? { slug: brand.slug, verified: brand.verified === 1 } : null,
  };
}

export function profile(ctx: Ctx, u: UserRow, viewerId?: number) {
  const count = (sql: string) => (ctx.db.prepare(sql).get(u.id) as { n: number }).n;
  return {
    ...userSummary(ctx, u),
    bio: u.bio,
    accountType: u.account_type,
    posts: count("SELECT COUNT(*) AS n FROM posts WHERE user_id = ?"),
    followers: count("SELECT COUNT(*) AS n FROM follows WHERE followee_id = ?"),
    following: count("SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?"),
    isFollowing:
      viewerId !== undefined && viewerId !== u.id
        ? Boolean(ctx.db.prepare("SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?").get(viewerId, u.id))
        : null,
    isMe: viewerId === u.id,
  };
}

export function me(ctx: Ctx, u: UserRow) {
  const brand = ctx.db.prepare("SELECT slug, name, verified FROM brands WHERE owner_id = ?").get(u.id) as
    | { slug: string; name: string; verified: number }
    | undefined;
  const claim = ctx.db
    .prepare(
      `SELECT b.slug, b.name, c.status FROM brand_claims c JOIN brands b ON b.id = c.brand_id
       WHERE c.user_id = ? ORDER BY c.id DESC LIMIT 1`,
    )
    .get(u.id) as { slug: string; name: string; status: string } | undefined;
  return {
    ...profile(ctx, u, u.id),
    email: u.email,
    isAdmin: u.is_admin === 1,
    ownedBrand: brand ? { slug: brand.slug, name: brand.name, verified: brand.verified === 1 } : null,
    brandClaim: claim ?? null,
  };
}

export function updateProfile(ctx: Ctx, userId: number, input: { displayName?: string; bio?: string }): void {
  const u = getUser(ctx, userId);
  ctx.db
    .prepare("UPDATE users SET display_name = ?, bio = ? WHERE id = ?")
    .run(input.displayName ?? u.display_name, input.bio ?? u.bio, userId);
}

export function setAvatar(ctx: Ctx, userId: number, path: string): string | null {
  const old = getUser(ctx, userId).avatar_path;
  ctx.db.prepare("UPDATE users SET avatar_path = ? WHERE id = ?").run(path, userId);
  return old;
}

export function follow(ctx: Ctx, followerId: number, username: string): void {
  const target = getUserByUsername(ctx, username);
  if (target.id === followerId) throw new AppError("VALIDATION_ERROR", "You can't follow yourself");
  ctx.db
    .prepare("INSERT OR IGNORE INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)")
    .run(followerId, target.id, ctx.now().toISOString());
}

export function unfollow(ctx: Ctx, followerId: number, username: string): void {
  const target = getUserByUsername(ctx, username);
  ctx.db.prepare("DELETE FROM follows WHERE follower_id = ? AND followee_id = ?").run(followerId, target.id);
}

export function searchUsers(ctx: Ctx, q: string) {
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = ctx.db
    .prepare("SELECT * FROM users WHERE username LIKE ? OR display_name LIKE ? ORDER BY username LIMIT 20")
    .all(like, like) as UserRow[];
  return rows.map((u) => userSummary(ctx, u));
}
