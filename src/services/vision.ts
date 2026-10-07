import { createHash } from "node:crypto";
import sharp from "sharp";
import { isBlocked, ImageRefusedError, type ImageAnalysis, type Verdict } from "../ai.js";
import type { Ctx } from "../context.js";
import type { Category } from "../db.js";
import { AppError } from "../errors.js";
import { slugify } from "../util.js";
import { brandSummary, publicProduct, type BrandRow, type ProductRow } from "./brands.js";

export interface StoredAnalysis {
  verdict: Verdict;
  minorConcern: boolean;
  reason: string;
  items: ImageAnalysis["items"];
}

const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

/** Smaller copy for the model: fewer image tokens, same judgement. */
async function forModel(original: Buffer): Promise<Buffer> {
  try {
    return await sharp(original, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new AppError("UNSUPPORTED_MEDIA", "File is not a supported image (JPEG, PNG, WebP, HEIC, AVIF or GIF)");
  }
}

/**
 * Analyse an uploaded file once (results are cached by content hash). Returns null when no AI
 * is configured. Throws AI_UNAVAILABLE when the model can't be reached, so callers fail closed.
 */
export async function analyzeImage(ctx: Ctx, original: Buffer): Promise<StoredAnalysis | null> {
  if (!ctx.ai) return null;
  const hash = sha256(original);
  const cached = ctx.db.prepare("SELECT * FROM image_analyses WHERE hash = ?").get(hash) as
    | { verdict: Verdict; minor_concern: number; reason: string; items: string }
    | undefined;
  if (cached) {
    return { verdict: cached.verdict, minorConcern: cached.minor_concern === 1, reason: cached.reason, items: JSON.parse(cached.items) };
  }

  const jpeg = await forModel(original);
  let result: StoredAnalysis;
  try {
    const a = await ctx.ai.analyze(jpeg);
    result = {
      verdict: a.safety.verdict,
      minorConcern: a.safety.minor_concern,
      reason: a.safety.reason,
      items: a.items.slice(0, 10).map((i) => ({ ...i, x: clamp01(i.x), y: clamp01(i.y), brand: i.brand?.trim() || null })),
    };
  } catch (err) {
    if (err instanceof ImageRefusedError) {
      // A declined review is treated as unsafe rather than waved through.
      result = { verdict: "sexual_activity", minorConcern: false, reason: "The photo couldn't be reviewed.", items: [] };
    } else {
      console.error("Image analysis failed:", err);
      throw new AppError("AI_UNAVAILABLE", "We couldn't check this photo right now. Please try again in a moment.");
    }
  }
  ctx.db
    .prepare("INSERT OR REPLACE INTO image_analyses (hash, verdict, minor_concern, reason, items, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(hash, result.verdict, result.minorConcern ? 1 : 0, result.reason, JSON.stringify(result.items), ctx.ai.model, ctx.now().toISOString());
  return result;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

export const REJECTION_MESSAGE =
  "This photo can't be posted because it appears to contain nudity or sexual content. Stylegram doesn't allow that.";

/** Reject the upload if it isn't allowed, recording the attempt (never the image) for admins. */
export async function assertImageAllowed(ctx: Ctx, userId: number, original: Buffer): Promise<StoredAnalysis | null> {
  const a = await analyzeImage(ctx, original);
  if (a && isBlocked({ safety: { verdict: a.verdict, minor_concern: a.minorConcern, reason: a.reason } })) {
    ctx.db
      .prepare("INSERT INTO moderation_events (user_id, hash, verdict, reason, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(userId, sha256(original), a.minorConcern ? "minor_concern" : a.verdict, a.reason, ctx.now().toISOString());
    throw new AppError("CONTENT_REJECTED", REJECTION_MESSAGE);
  }
  return a;
}

/** Tag suggestions: detected items, matched to known brands (and a catalog product when one fits). */
export function suggestionsFor(ctx: Ctx, a: StoredAnalysis) {
  return a.items.map((item) => {
    let brand: BrandRow | undefined;
    let product: ProductRow | undefined;
    if (item.brand) {
      brand = ctx.db.prepare("SELECT * FROM brands WHERE slug = ?").get(slugify(item.brand)) as BrandRow | undefined;
      if (brand) product = bestProduct(ctx, brand.id, item.label, item.category);
    }
    return {
      label: product?.name ?? item.label,
      category: item.category,
      x: item.x,
      y: item.y,
      brandName: brand?.name ?? item.brand,
      brand: brand ? brandSummary(brand) : null,
      product: product ? publicProduct(product) : null,
    };
  });
}

/** The brand's product in the same category that shares the most words with the detected label. */
function bestProduct(ctx: Ctx, brandId: number, label: string, category: Category): ProductRow | undefined {
  const words = new Set(label.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  const products = ctx.db
    .prepare("SELECT * FROM products WHERE brand_id = ? AND active = 1 AND category = ?")
    .all(brandId, category) as ProductRow[];
  let best: ProductRow | undefined;
  let bestScore = 0;
  for (const p of products) {
    const score = p.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => words.has(w)).length;
    if (score > bestScore) [best, bestScore] = [p, score];
  }
  return best;
}

export function recentModerationEvents(ctx: Ctx, limit = 50) {
  return ctx.db
    .prepare(
      `SELECT m.id, m.verdict, m.reason, m.created_at, u.username FROM moderation_events m
       LEFT JOIN users u ON u.id = m.user_id ORDER BY m.id DESC LIMIT ?`,
    )
    .all(limit);
}
