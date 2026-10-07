import type { Ctx } from "../context.js";
import type { Category } from "../db.js";
import { AppError } from "../errors.js";
import { mediaUrl, type StoredImage } from "../media.js";
import { withUtm } from "../util.js";
import { brandSummary, findOrCreateBrand, getBrand, getProduct, publicProduct, type BrandRow } from "./brands.js";
import { getUser, getUserByUsername, userSummary } from "./users.js";

export interface TagInput {
  image: number; // index of the image within the post
  x: number;
  y: number;
  label: string;
  category: Category;
  brandSlug?: string; // an existing brand...
  brandName?: string; // ...or a name to find/create
  productId?: number;
  url?: string;
}

interface PostRow {
  id: number;
  user_id: number;
  caption: string;
  created_at: string;
}

interface ImageRow {
  id: number;
  post_id: number;
  position: number;
  path: string;
  thumb_path: string;
  width: number;
  height: number;
}

interface TagRow {
  id: number;
  post_id: number;
  image_id: number;
  x: number;
  y: number;
  brand_id: number;
  product_id: number | null;
  label: string;
  category: Category;
  url: string | null;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
  created_at: string;
}

function resolveTagBrand(ctx: Ctx, userId: number, t: TagInput): BrandRow {
  if (t.brandSlug) {
    const b = ctx.db.prepare("SELECT * FROM brands WHERE slug = ?").get(t.brandSlug) as BrandRow | undefined;
    if (!b) throw new AppError("VALIDATION_ERROR", `Unknown brand: ${t.brandSlug}`);
    return b;
  }
  if (t.brandName) return findOrCreateBrand(ctx, t.brandName, userId);
  throw new AppError("VALIDATION_ERROR", "Each tag needs a brand");
}

function insertTag(ctx: Ctx, userId: number, postId: number, imageId: number, t: TagInput): number {
  const brand = resolveTagBrand(ctx, userId, t);
  if (t.productId !== undefined) {
    const p = getProduct(ctx, t.productId);
    if (p.brand_id !== brand.id || !p.active) throw new AppError("VALIDATION_ERROR", `Product ${t.productId} doesn't belong to ${brand.name}`);
  }
  // A verified brand tagging its own products in its own posts needs no review.
  const status = brand.verified && brand.owner_id === userId ? "CONFIRMED" : "PENDING";
  const info = ctx.db
    .prepare(
      `INSERT INTO tags (post_id, image_id, x, y, brand_id, product_id, label, category, url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(postId, imageId, t.x, t.y, brand.id, t.productId ?? null, t.label, t.category, t.url ?? null, status, ctx.now().toISOString());
  return Number(info.lastInsertRowid);
}

export function createPost(ctx: Ctx, userId: number, images: StoredImage[], caption: string, tags: TagInput[]): number {
  if (images.length === 0) throw new AppError("VALIDATION_ERROR", "A post needs at least one photo");
  for (const t of tags) {
    if (!Number.isInteger(t.image) || t.image < 0 || t.image >= images.length) {
      throw new AppError("VALIDATION_ERROR", `Tag refers to image ${t.image}, but the post has ${images.length}`);
    }
  }
  for (let i = 0; i < images.length; i++) {
    if (tags.filter((t) => t.image === i).length > ctx.config.upload.maxTagsPerImage) {
      throw new AppError("VALIDATION_ERROR", `At most ${ctx.config.upload.maxTagsPerImage} tags per photo`);
    }
  }
  return ctx.db.transaction(() => {
    const info = ctx.db
      .prepare("INSERT INTO posts (user_id, caption, created_at) VALUES (?, ?, ?)")
      .run(userId, caption, ctx.now().toISOString());
    const postId = Number(info.lastInsertRowid);
    const imageIds = images.map((img, i) =>
      Number(
        ctx.db
          .prepare("INSERT INTO post_images (post_id, position, path, thumb_path, width, height) VALUES (?, ?, ?, ?, ?, ?)")
          .run(postId, i, img.path, img.thumbPath, img.width, img.height).lastInsertRowid,
      ),
    );
    for (const t of tags) insertTag(ctx, userId, postId, imageIds[t.image]!, t);
    return postId;
  })();
}

function getPostRow(ctx: Ctx, id: number): PostRow {
  const p = ctx.db.prepare("SELECT * FROM posts WHERE id = ?").get(id) as PostRow | undefined;
  if (!p) throw new AppError("NOT_FOUND", "Post not found");
  return p;
}

function ownPost(ctx: Ctx, userId: number, postId: number): PostRow {
  const p = getPostRow(ctx, postId);
  if (p.user_id !== userId) throw new AppError("FORBIDDEN", "That's not your post");
  return p;
}

/** Where a tag's "Shop" button leads: the catalog product, else the tagger's link, else the brand site. */
function effectiveUrl(ctx: Ctx, t: TagRow): string | null {
  if (t.product_id) {
    const p = ctx.db.prepare("SELECT url FROM products WHERE id = ?").get(t.product_id) as { url: string } | undefined;
    if (p) return p.url;
  }
  if (t.url) return t.url;
  return getBrand(ctx, t.brand_id).website;
}

function publicTag(ctx: Ctx, t: TagRow) {
  const product = t.product_id ? getProduct(ctx, t.product_id) : null;
  return {
    id: t.id,
    x: t.x,
    y: t.y,
    label: t.label,
    category: t.category,
    status: t.status,
    brand: brandSummary(getBrand(ctx, t.brand_id)),
    product: product ? publicProduct(product) : null,
    shopUrl: effectiveUrl(ctx, t) ? `/t/${t.id}` : null,
  };
}

export function postView(ctx: Ctx, postId: number, viewerId?: number) {
  const p = getPostRow(ctx, postId);
  const isOwner = viewerId === p.user_id;
  const images = ctx.db.prepare("SELECT * FROM post_images WHERE post_id = ? ORDER BY position").all(p.id) as ImageRow[];
  // Brand-rejected tags are only shown to the post's author, so they can fix them.
  const tags = ctx.db
    .prepare(`SELECT * FROM tags WHERE post_id = ? ${isOwner ? "" : "AND status != 'REJECTED'"} ORDER BY id`)
    .all(p.id) as TagRow[];
  const one = (sql: string, ...args: unknown[]) => ctx.db.prepare(sql).get(...args) as { n: number };
  return {
    id: p.id,
    author: userSummary(ctx, getUser(ctx, p.user_id)),
    caption: p.caption,
    images: images.map((img) => ({
      id: img.id,
      url: mediaUrl(img.path),
      thumbUrl: mediaUrl(img.thumb_path),
      width: img.width,
      height: img.height,
      tags: tags.filter((t) => t.image_id === img.id).map((t) => publicTag(ctx, t)),
    })),
    likes: one("SELECT COUNT(*) AS n FROM likes WHERE post_id = ?", p.id).n,
    comments: one("SELECT COUNT(*) AS n FROM comments WHERE post_id = ?", p.id).n,
    likedByMe: viewerId ? Boolean(ctx.db.prepare("SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?").get(p.id, viewerId)) : false,
    savedByMe: viewerId ? Boolean(ctx.db.prepare("SELECT 1 FROM saves WHERE post_id = ? AND user_id = ?").get(p.id, viewerId)) : false,
    isMine: isOwner,
    createdAt: p.created_at,
  };
}

/** Lightweight card for profile / brand / explore grids. */
function postCard(ctx: Ctx, row: { id: number }) {
  const img = ctx.db.prepare("SELECT thumb_path FROM post_images WHERE post_id = ? ORDER BY position LIMIT 1").get(row.id) as {
    thumb_path: string;
  };
  const counts = ctx.db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM post_images WHERE post_id = @id) AS images,
              (SELECT COUNT(*) FROM tags WHERE post_id = @id AND status != 'REJECTED') AS tags,
              (SELECT COUNT(*) FROM likes WHERE post_id = @id) AS likes`,
    )
    .get({ id: row.id }) as { images: number; tags: number; likes: number };
  return { id: row.id, thumbUrl: mediaUrl(img.thumb_path), ...counts };
}

export interface Page {
  limit: number;
  before?: number; // post id cursor
}

const cursor = (page: Page) => (page.before ? "AND p.id < @before" : "");

export function feed(ctx: Ctx, userId: number, page: Page) {
  const rows = ctx.db
    .prepare(
      `SELECT p.id FROM posts p
       WHERE (p.user_id = @userId OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = @userId)) ${cursor(page)}
       ORDER BY p.id DESC LIMIT @limit`,
    )
    .all({ userId, ...page }) as { id: number }[];
  return rows.map((r) => postView(ctx, r.id, userId));
}

export function explore(ctx: Ctx, page: Page & { category?: Category; q?: string }) {
  const filters: string[] = [];
  if (page.category) filters.push("EXISTS (SELECT 1 FROM tags t WHERE t.post_id = p.id AND t.category = @category AND t.status != 'REJECTED')");
  if (page.q) {
    filters.push(`(p.caption LIKE @like OR EXISTS (
      SELECT 1 FROM tags t JOIN brands b ON b.id = t.brand_id
      WHERE t.post_id = p.id AND t.status != 'REJECTED' AND (b.name LIKE @like OR t.label LIKE @like)))`);
  }
  const rows = ctx.db
    .prepare(
      `SELECT p.id FROM posts p WHERE 1 = 1 ${filters.map((f) => `AND ${f}`).join(" ")} ${cursor(page)}
       ORDER BY p.id DESC LIMIT @limit`,
    )
    .all({ ...page, like: page.q ? `%${page.q.replace(/[%_]/g, "")}%` : undefined }) as { id: number }[];
  return rows.map((r) => postCard(ctx, r));
}

export function userPosts(ctx: Ctx, username: string, page: Page) {
  const u = getUserByUsername(ctx, username);
  const rows = ctx.db
    .prepare(`SELECT p.id FROM posts p WHERE p.user_id = @userId ${cursor(page)} ORDER BY p.id DESC LIMIT @limit`)
    .all({ userId: u.id, ...page }) as { id: number }[];
  return rows.map((r) => postCard(ctx, r));
}

/** "Seen on" grid for a brand page: posts that tag the brand (not rejected), optionally one product. */
export function brandPosts(ctx: Ctx, brandId: number, page: Page & { productId?: number }) {
  const rows = ctx.db
    .prepare(
      `SELECT p.id FROM posts p WHERE EXISTS (
         SELECT 1 FROM tags t WHERE t.post_id = p.id AND t.brand_id = @brandId AND t.status != 'REJECTED'
         ${page.productId ? "AND t.product_id = @productId" : ""}) ${cursor(page)}
       ORDER BY p.id DESC LIMIT @limit`,
    )
    .all({ brandId, ...page }) as { id: number }[];
  return rows.map((r) => postCard(ctx, r));
}

export function savedPosts(ctx: Ctx, userId: number, page: Page) {
  const rows = ctx.db
    .prepare(
      `SELECT p.id FROM posts p JOIN saves s ON s.post_id = p.id AND s.user_id = @userId
       WHERE 1 = 1 ${cursor(page)} ORDER BY p.id DESC LIMIT @limit`,
    )
    .all({ userId, ...page }) as { id: number }[];
  return rows.map((r) => postCard(ctx, r));
}

/** Delete a post. Returns image paths so the caller can remove the files. */
export function deletePost(ctx: Ctx, userId: number, postId: number): string[] {
  const p = ownPost(ctx, userId, postId);
  const images = ctx.db.prepare("SELECT path, thumb_path FROM post_images WHERE post_id = ?").all(p.id) as {
    path: string;
    thumb_path: string;
  }[];
  ctx.db.prepare("DELETE FROM posts WHERE id = ?").run(p.id);
  return images.flatMap((i) => [i.path, i.thumb_path]);
}

export function updateCaption(ctx: Ctx, userId: number, postId: number, caption: string): void {
  const p = ownPost(ctx, userId, postId);
  ctx.db.prepare("UPDATE posts SET caption = ? WHERE id = ?").run(caption, p.id);
}

export function addTag(ctx: Ctx, userId: number, postId: number, imageId: number, t: Omit<TagInput, "image">): number {
  const p = ownPost(ctx, userId, postId);
  const img = ctx.db.prepare("SELECT id FROM post_images WHERE id = ? AND post_id = ?").get(imageId, p.id);
  if (!img) throw new AppError("NOT_FOUND", "Photo not found in this post");
  const n = (ctx.db.prepare("SELECT COUNT(*) AS n FROM tags WHERE image_id = ?").get(imageId) as { n: number }).n;
  if (n >= ctx.config.upload.maxTagsPerImage) throw new AppError("VALIDATION_ERROR", `At most ${ctx.config.upload.maxTagsPerImage} tags per photo`);
  return ctx.db.transaction(() => insertTag(ctx, userId, p.id, imageId, { ...t, image: 0 }))();
}

export function deleteTag(ctx: Ctx, userId: number, tagId: number): void {
  const t = ctx.db.prepare("SELECT post_id FROM tags WHERE id = ?").get(tagId) as { post_id: number } | undefined;
  if (!t) throw new AppError("NOT_FOUND", "Tag not found");
  ownPost(ctx, userId, t.post_id);
  ctx.db.prepare("DELETE FROM tags WHERE id = ?").run(tagId);
}

/** Record an outbound click and return the destination (with UTM parameters). */
export function trackClick(ctx: Ctx, tagId: number): string {
  const t = ctx.db.prepare("SELECT * FROM tags WHERE id = ? AND status != 'REJECTED'").get(tagId) as TagRow | undefined;
  if (!t) throw new AppError("NOT_FOUND", "Link not found");
  const url = effectiveUrl(ctx, t);
  if (!url) throw new AppError("NOT_FOUND", "This tag has no link");
  ctx.db.prepare("INSERT INTO tag_clicks (tag_id, created_at) VALUES (?, ?)").run(t.id, ctx.now().toISOString());
  return withUtm(url, ctx.config.utmSource, `post_${t.post_id}`);
}

// ---- Engagement -----------------------------------------------------------

export function setLike(ctx: Ctx, userId: number, postId: number, liked: boolean): void {
  getPostRow(ctx, postId);
  if (liked) {
    ctx.db.prepare("INSERT OR IGNORE INTO likes (user_id, post_id, created_at) VALUES (?, ?, ?)").run(userId, postId, ctx.now().toISOString());
  } else {
    ctx.db.prepare("DELETE FROM likes WHERE user_id = ? AND post_id = ?").run(userId, postId);
  }
}

export function setSave(ctx: Ctx, userId: number, postId: number, saved: boolean): void {
  getPostRow(ctx, postId);
  if (saved) {
    ctx.db.prepare("INSERT OR IGNORE INTO saves (user_id, post_id, created_at) VALUES (?, ?, ?)").run(userId, postId, ctx.now().toISOString());
  } else {
    ctx.db.prepare("DELETE FROM saves WHERE user_id = ? AND post_id = ?").run(userId, postId);
  }
}

export function addComment(ctx: Ctx, userId: number, postId: number, body: string) {
  getPostRow(ctx, postId);
  const info = ctx.db
    .prepare("INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)")
    .run(postId, userId, body, ctx.now().toISOString());
  return listComments(ctx, postId).find((c) => c.id === Number(info.lastInsertRowid))!;
}

export function listComments(ctx: Ctx, postId: number) {
  getPostRow(ctx, postId);
  const rows = ctx.db
    .prepare("SELECT * FROM comments WHERE post_id = ? ORDER BY id LIMIT 500")
    .all(postId) as { id: number; user_id: number; body: string; created_at: string }[];
  return rows.map((c) => ({ id: c.id, author: userSummary(ctx, getUser(ctx, c.user_id)), body: c.body, createdAt: c.created_at }));
}

export function deleteComment(ctx: Ctx, userId: number, commentId: number): void {
  const c = ctx.db
    .prepare("SELECT c.user_id, p.user_id AS post_owner FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?")
    .get(commentId) as { user_id: number; post_owner: number } | undefined;
  if (!c) throw new AppError("NOT_FOUND", "Comment not found");
  // Authors can delete their comments; post owners can delete any comment on their post.
  if (c.user_id !== userId && c.post_owner !== userId) throw new AppError("FORBIDDEN", "You can't delete this comment");
  ctx.db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
}
