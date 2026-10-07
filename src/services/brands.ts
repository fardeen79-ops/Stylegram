import type { Ctx } from "../context.js";
import type { Category } from "../db.js";
import { AppError } from "../errors.js";
import { mediaUrl } from "../media.js";
import { slugify } from "../util.js";
import { getUser } from "./users.js";

export interface BrandRow {
  id: number;
  slug: string;
  name: string;
  website: string | null;
  logo_path: string | null;
  description: string;
  verified: number;
  owner_id: number | null;
  created_by: number | null;
  created_at: string;
}

export interface ProductRow {
  id: number;
  brand_id: number;
  name: string;
  url: string;
  price_cents: number | null;
  currency: string;
  category: Category;
  active: number;
  created_at: string;
}

export function brandSummary(b: BrandRow) {
  return { slug: b.slug, name: b.name, verified: b.verified === 1, logoUrl: mediaUrl(b.logo_path) };
}

export function publicBrand(ctx: Ctx, b: BrandRow) {
  const stats = ctx.db
    .prepare(
      `SELECT COUNT(DISTINCT post_id) AS posts, COUNT(*) AS tags FROM tags WHERE brand_id = ? AND status != 'REJECTED'`,
    )
    .get(b.id) as { posts: number; tags: number };
  const owner = b.owner_id ? getUser(ctx, b.owner_id) : null;
  return {
    ...brandSummary(b),
    website: b.website,
    description: b.description,
    claimed: b.owner_id !== null,
    account: owner && b.verified ? { username: owner.username } : null,
    postCount: stats.posts,
    tagCount: stats.tags,
  };
}

export function publicProduct(p: ProductRow) {
  return {
    id: p.id,
    name: p.name,
    url: p.url,
    price: p.price_cents === null ? null : (p.price_cents / 100).toFixed(2),
    currency: p.currency,
    category: p.category,
  };
}

export function getBrandBySlug(ctx: Ctx, slug: string): BrandRow {
  const b = ctx.db.prepare("SELECT * FROM brands WHERE slug = ?").get(slug) as BrandRow | undefined;
  if (!b) throw new AppError("NOT_FOUND", "Brand not found");
  return b;
}

export function getBrand(ctx: Ctx, id: number): BrandRow {
  const b = ctx.db.prepare("SELECT * FROM brands WHERE id = ?").get(id) as BrandRow | undefined;
  if (!b) throw new AppError("NOT_FOUND", "Brand not found");
  return b;
}

/** Look a brand up by name, creating an unclaimed "community" brand if nobody has tagged it before. */
export function findOrCreateBrand(ctx: Ctx, name: string, createdBy: number): BrandRow {
  const slug = slugify(name);
  if (!slug) throw new AppError("VALIDATION_ERROR", `Invalid brand name: ${JSON.stringify(name)}`);
  const existing = ctx.db.prepare("SELECT * FROM brands WHERE slug = ?").get(slug) as BrandRow | undefined;
  if (existing) return existing;
  const info = ctx.db
    .prepare("INSERT INTO brands (slug, name, created_by, created_at) VALUES (?, ?, ?, ?)")
    .run(slug, name.trim(), createdBy, ctx.now().toISOString());
  return getBrand(ctx, Number(info.lastInsertRowid));
}

export function searchBrands(ctx: Ctx, q: string, limit = 10): BrandRow[] {
  const term = q.replace(/[%_]/g, "").trim();
  return ctx.db
    .prepare(
      `SELECT b.*, (SELECT COUNT(*) FROM tags t WHERE t.brand_id = b.id) AS uses FROM brands b
       WHERE b.name LIKE @like OR b.slug LIKE @like
       ORDER BY b.verified DESC, (b.slug = @slug) DESC, uses DESC, b.name LIMIT @limit`,
    )
    .all({ like: `%${term}%`, slug: slugify(term), limit }) as BrandRow[];
}

export function listProducts(ctx: Ctx, brandId: number, q?: string): ProductRow[] {
  const like = `%${(q ?? "").replace(/[%_]/g, "")}%`;
  return ctx.db
    .prepare("SELECT * FROM products WHERE brand_id = ? AND active = 1 AND name LIKE ? ORDER BY name LIMIT 100")
    .all(brandId, like) as ProductRow[];
}

export function getProduct(ctx: Ctx, id: number): ProductRow {
  const p = ctx.db.prepare("SELECT * FROM products WHERE id = ?").get(id) as ProductRow | undefined;
  if (!p) throw new AppError("NOT_FOUND", "Product not found");
  return p;
}

// ---- Brand owner actions (require a verified brand) ------------------------

/** The verified brand this user manages. Unverified brands cannot manage products or tags. */
export function managedBrand(ctx: Ctx, userId: number): BrandRow {
  const b = ctx.db.prepare("SELECT * FROM brands WHERE owner_id = ?").get(userId) as BrandRow | undefined;
  if (!b) throw new AppError("FORBIDDEN", "You don't manage a brand");
  if (!b.verified) throw new AppError("FORBIDDEN", "Your brand is waiting for verification");
  return b;
}

export function updateBrand(ctx: Ctx, userId: number, input: { website?: string; description?: string }): BrandRow {
  const b = managedBrand(ctx, userId);
  ctx.db
    .prepare("UPDATE brands SET website = ?, description = ? WHERE id = ?")
    .run(input.website ?? b.website, input.description ?? b.description, b.id);
  return getBrand(ctx, b.id);
}

export function setBrandLogo(ctx: Ctx, userId: number, path: string): string | null {
  const b = managedBrand(ctx, userId);
  ctx.db.prepare("UPDATE brands SET logo_path = ? WHERE id = ?").run(path, b.id);
  return b.logo_path;
}

export interface ProductInput {
  name: string;
  url: string;
  priceCents?: number;
  currency?: string;
  category: Category;
}

export function createProduct(ctx: Ctx, userId: number, input: ProductInput): ProductRow {
  const b = managedBrand(ctx, userId);
  const info = ctx.db
    .prepare(
      "INSERT INTO products (brand_id, name, url, price_cents, currency, category, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(b.id, input.name, input.url, input.priceCents ?? null, input.currency ?? "USD", input.category, ctx.now().toISOString());
  return getProduct(ctx, Number(info.lastInsertRowid));
}

function ownedProduct(ctx: Ctx, userId: number, productId: number): ProductRow {
  const b = managedBrand(ctx, userId);
  const p = getProduct(ctx, productId);
  if (p.brand_id !== b.id) throw new AppError("NOT_FOUND", "Product not found");
  return p;
}

export function updateProduct(ctx: Ctx, userId: number, productId: number, input: Partial<ProductInput>): ProductRow {
  const p = ownedProduct(ctx, userId, productId);
  ctx.db
    .prepare("UPDATE products SET name = ?, url = ?, price_cents = ?, currency = ?, category = ? WHERE id = ?")
    .run(
      input.name ?? p.name,
      input.url ?? p.url,
      input.priceCents === undefined ? p.price_cents : input.priceCents,
      input.currency ?? p.currency,
      input.category ?? p.category,
      p.id,
    );
  return getProduct(ctx, p.id);
}

/** Products are archived rather than deleted so existing tags keep their history. */
export function archiveProduct(ctx: Ctx, userId: number, productId: number): void {
  const p = ownedProduct(ctx, userId, productId);
  ctx.db.prepare("UPDATE products SET active = 0 WHERE id = ?").run(p.id);
}

/**
 * Brand review of a tag: CONFIRM it (optionally correcting it to a catalog product) or
 * REJECT it ("not our item"). Rejected tags are hidden from everyone but the post's author.
 */
export function reviewTag(
  ctx: Ctx,
  userId: number,
  tagId: number,
  input: { action: "CONFIRM" | "REJECT"; productId?: number | null },
): void {
  const b = managedBrand(ctx, userId);
  const tag = ctx.db.prepare("SELECT id, brand_id FROM tags WHERE id = ?").get(tagId) as
    | { id: number; brand_id: number }
    | undefined;
  if (!tag || tag.brand_id !== b.id) throw new AppError("NOT_FOUND", "Tag not found");
  if (input.productId !== undefined && input.productId !== null) {
    const p = getProduct(ctx, input.productId);
    if (p.brand_id !== b.id || !p.active) throw new AppError("VALIDATION_ERROR", "That product isn't in your catalog");
  }
  const status = input.action === "CONFIRM" ? "CONFIRMED" : "REJECTED";
  if (input.productId !== undefined) {
    ctx.db
      .prepare("UPDATE tags SET status = ?, product_id = ?, reviewed_at = ? WHERE id = ?")
      .run(status, input.productId, ctx.now().toISOString(), tag.id);
  } else {
    ctx.db.prepare("UPDATE tags SET status = ?, reviewed_at = ? WHERE id = ?").run(status, ctx.now().toISOString(), tag.id);
  }
}

/** Tags of the managed brand, newest first, optionally by status. */
export function brandTags(ctx: Ctx, userId: number, status?: "PENDING" | "CONFIRMED" | "REJECTED") {
  const b = managedBrand(ctx, userId);
  const rows = ctx.db
    .prepare(
      `SELECT t.*, i.thumb_path, u.username, p.name AS product_name,
              (SELECT COUNT(*) FROM tag_clicks c WHERE c.tag_id = t.id) AS clicks
       FROM tags t JOIN post_images i ON i.id = t.image_id JOIN posts po ON po.id = t.post_id
       JOIN users u ON u.id = po.user_id LEFT JOIN products p ON p.id = t.product_id
       WHERE t.brand_id = ? ${status ? "AND t.status = ?" : ""}
       ORDER BY t.id DESC LIMIT 200`,
    )
    .all(...(status ? [b.id, status] : [b.id])) as {
    id: number;
    post_id: number;
    label: string;
    category: string;
    url: string | null;
    status: string;
    product_id: number | null;
    product_name: string | null;
    thumb_path: string;
    username: string;
    clicks: number;
    created_at: string;
  }[];
  return rows.map((r) => ({
    id: r.id,
    postId: r.post_id,
    label: r.label,
    category: r.category,
    url: r.url,
    status: r.status,
    product: r.product_id ? { id: r.product_id, name: r.product_name } : null,
    thumbUrl: mediaUrl(r.thumb_path),
    author: r.username,
    clicks: r.clicks,
    createdAt: r.created_at,
  }));
}

export function brandDashboard(ctx: Ctx, userId: number) {
  const b = managedBrand(ctx, userId);
  const since = (days: number) => new Date(ctx.now().getTime() - days * 86_400_000).toISOString();
  const db = ctx.db;
  const counts = db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(status = 'PENDING') AS pending, SUM(status = 'CONFIRMED') AS confirmed, SUM(status = 'REJECTED') AS rejected,
              COUNT(DISTINCT post_id) AS posts,
              COUNT(DISTINCT (SELECT user_id FROM posts WHERE posts.id = tags.post_id)) AS creators
       FROM tags WHERE brand_id = ?`,
    )
    .get(b.id) as Record<string, number | null>;
  const clicks = (from: string) =>
    (
      db
        .prepare("SELECT COUNT(*) AS n FROM tag_clicks c JOIN tags t ON t.id = c.tag_id WHERE t.brand_id = ? AND c.created_at >= ?")
        .get(b.id, from) as { n: number }
    ).n;
  const topProducts = db
    .prepare(
      `SELECT p.id, p.name, COUNT(DISTINCT t.id) AS tags,
              (SELECT COUNT(*) FROM tag_clicks c JOIN tags t2 ON t2.id = c.tag_id WHERE t2.product_id = p.id) AS clicks
       FROM products p JOIN tags t ON t.product_id = p.id AND t.status != 'REJECTED'
       WHERE p.brand_id = ? GROUP BY p.id ORDER BY tags DESC, clicks DESC LIMIT 10`,
    )
    .all(b.id);
  return {
    brand: publicBrand(ctx, b),
    tags: {
      total: counts.total ?? 0,
      pending: counts.pending ?? 0,
      confirmed: counts.confirmed ?? 0,
      rejected: counts.rejected ?? 0,
    },
    posts: counts.posts ?? 0,
    creators: counts.creators ?? 0,
    clicks: { last7Days: clicks(since(7)), last30Days: clicks(since(30)) },
    topProducts,
  };
}

// ---- Admin ----------------------------------------------------------------

export function requireAdmin(ctx: Ctx, userId: number): void {
  if (!getUser(ctx, userId).is_admin) throw new AppError("FORBIDDEN", "Admins only");
}

export function adminQueue(ctx: Ctx, userId: number) {
  requireAdmin(ctx, userId);
  const unverified = ctx.db
    .prepare(
      `SELECT b.*, u.username FROM brands b JOIN users u ON u.id = b.owner_id
       WHERE b.verified = 0 ORDER BY b.created_at`,
    )
    .all() as (BrandRow & { username: string })[];
  const claims = ctx.db
    .prepare(
      `SELECT c.id, c.message, c.created_at, b.slug, b.name, u.username, u.email FROM brand_claims c
       JOIN brands b ON b.id = c.brand_id JOIN users u ON u.id = c.user_id
       WHERE c.status = 'PENDING' ORDER BY c.created_at`,
    )
    .all();
  return {
    brandsToVerify: unverified.map((b) => ({ ...brandSummary(b), website: b.website, owner: b.username })),
    claims,
  };
}

export function verifyBrand(ctx: Ctx, adminId: number, slug: string, verified: boolean): void {
  requireAdmin(ctx, adminId);
  const b = getBrandBySlug(ctx, slug);
  if (verified && b.owner_id === null) throw new AppError("VALIDATION_ERROR", "Only brands with an account can be verified");
  ctx.db.prepare("UPDATE brands SET verified = ? WHERE id = ?").run(verified ? 1 : 0, b.id);
}

export function decideClaim(ctx: Ctx, adminId: number, claimId: number, approve: boolean): void {
  requireAdmin(ctx, adminId);
  const claim = ctx.db.prepare("SELECT * FROM brand_claims WHERE id = ?").get(claimId) as
    | { id: number; brand_id: number; user_id: number; status: string }
    | undefined;
  if (!claim) throw new AppError("NOT_FOUND", "Claim not found");
  if (claim.status !== "PENDING") throw new AppError("CONFLICT", "Claim already decided");
  const now = ctx.now().toISOString();
  ctx.db.transaction(() => {
    if (approve) {
      const b = getBrand(ctx, claim.brand_id);
      if (b.owner_id !== null) throw new AppError("CONFLICT", "Brand already has an owner");
      if (ctx.db.prepare("SELECT 1 FROM brands WHERE owner_id = ?").get(claim.user_id)) {
        throw new AppError("CONFLICT", "That user already manages a brand");
      }
      ctx.db.prepare("UPDATE brands SET owner_id = ?, verified = 1 WHERE id = ?").run(claim.user_id, b.id);
      // Any other pending claims for this brand lose.
      ctx.db
        .prepare("UPDATE brand_claims SET status = 'REJECTED', decided_at = ? WHERE brand_id = ? AND status = 'PENDING' AND id != ?")
        .run(now, b.id, claim.id);
    }
    ctx.db.prepare("UPDATE brand_claims SET status = ?, decided_at = ? WHERE id = ?").run(approve ? "APPROVED" : "REJECTED", now, claim.id);
  })();
}
