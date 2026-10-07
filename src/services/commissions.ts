/**
 * Commission on purchases made through Shop links.
 *
 * Flow: a Shop click gets a unique click id (`sg_click`) appended to the brand's URL. The brand's
 * site keeps it until checkout, then its server reports the order to POST /api/v1/conversions with
 * its API key. Stylegram attributes the sale to the tag's post, computes the commission at the
 * brand's rate, and splits it between the creator and the platform. A conversion is pending for
 * the refund window (default 30 days) and then approved, unless the brand reverses it.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Ctx } from "../context.js";
import { AppError } from "../errors.js";
import { getBrand, managedBrand, type BrandRow } from "./brands.js";

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

export function newClickId(): string {
  return `sgc_${randomBytes(12).toString("base64url")}`;
}

// ---- Brand program settings & API key ---------------------------------------

export function updateProgram(ctx: Ctx, userId: number, input: { commissionPercent: number | null; attributionDays?: number }) {
  const b = managedBrand(ctx, userId);
  const bps = input.commissionPercent === null ? null : Math.round(input.commissionPercent * 100);
  ctx.db
    .prepare("UPDATE brands SET commission_bps = ?, attribution_days = ? WHERE id = ?")
    .run(bps, input.attributionDays ?? (b as BrandRow & { attribution_days: number }).attribution_days, b.id);
  return programSettings(ctx, getBrand(ctx, b.id));
}

/** Create (or rotate) the brand's conversion API key. The full key is only ever shown once. */
export function rotateApiKey(ctx: Ctx, userId: number): { apiKey: string; prefix: string } {
  const b = managedBrand(ctx, userId);
  const apiKey = `sgk_${randomBytes(24).toString("base64url")}`;
  const prefix = apiKey.slice(0, 12);
  ctx.db.prepare("UPDATE brands SET api_key_hash = ?, api_key_prefix = ? WHERE id = ?").run(hashKey(apiKey), prefix, b.id);
  return { apiKey, prefix };
}

type ProgramBrand = BrandRow & { commission_bps: number | null; attribution_days: number; api_key_prefix: string | null };

export function programSettings(ctx: Ctx, b: BrandRow) {
  const p = b as ProgramBrand;
  return {
    enabled: p.commission_bps !== null,
    commissionPercent: p.commission_bps === null ? null : p.commission_bps / 100,
    attributionDays: p.attribution_days,
    apiKeyPrefix: p.api_key_prefix,
    creatorSharePercent: ctx.config.commissions.creatorSharePercent,
    approvalDays: ctx.config.commissions.approvalDays,
  };
}

export function brandFromApiKey(ctx: Ctx, authorization: string | undefined): ProgramBrand {
  const [scheme, key] = (authorization ?? "").split(" ");
  if (scheme !== "Bearer" || !key?.startsWith("sgk_")) throw new AppError("UNAUTHORIZED", "Missing or invalid API key");
  const b = ctx.db.prepare("SELECT * FROM brands WHERE api_key_hash = ?").get(hashKey(key)) as ProgramBrand | undefined;
  if (!b) throw new AppError("UNAUTHORIZED", "Missing or invalid API key");
  if (!b.verified) throw new AppError("FORBIDDEN", "Brand is not verified");
  return b;
}

/** Whether Shop links for this brand can earn a commission (for the shopper disclosure). */
export function earnsCommission(ctx: Ctx, brand: BrandRow): boolean {
  return (brand as ProgramBrand).commission_bps !== null || Boolean(ctx.config.commissions.affiliateLinkTemplate);
}

// ---- Conversions --------------------------------------------------------------

interface ConversionRow {
  id: number;
  brand_id: number;
  click_id: string;
  tag_id: number | null;
  post_id: number | null;
  creator_id: number | null;
  order_id: string;
  amount_cents: number;
  currency: string;
  commission_bps: number;
  commission_cents: number;
  creator_cents: number;
  reversed_at: string | null;
  created_at: string;
}

export type ConversionStatus = "PENDING" | "APPROVED" | "REVERSED";

function statusOf(ctx: Ctx, c: ConversionRow): ConversionStatus {
  if (c.reversed_at) return "REVERSED";
  const approvedAt = new Date(c.created_at).getTime() + ctx.config.commissions.approvalDays * 86_400_000;
  return ctx.now().getTime() >= approvedAt ? "APPROVED" : "PENDING";
}

const money = (cents: number) => (cents / 100).toFixed(2);

function publicConversion(ctx: Ctx, c: ConversionRow, view: "brand" | "creator") {
  const tag = c.tag_id
    ? (ctx.db.prepare("SELECT label FROM tags WHERE id = ?").get(c.tag_id) as { label: string } | undefined)
    : undefined;
  const creator = c.creator_id
    ? (ctx.db.prepare("SELECT username FROM users WHERE id = ?").get(c.creator_id) as { username: string } | undefined)
    : undefined;
  const brand = getBrand(ctx, c.brand_id);
  return {
    id: c.id,
    orderId: view === "brand" ? c.order_id : undefined,
    item: tag?.label ?? null,
    postId: c.post_id,
    creator: view === "brand" ? (creator?.username ?? null) : undefined,
    brand: { slug: brand.slug, name: brand.name },
    amount: money(c.amount_cents),
    currency: c.currency,
    commission: money(c.commission_cents),
    creatorEarnings: money(c.creator_cents),
    status: statusOf(ctx, c),
    createdAt: c.created_at,
  };
}

export interface ConversionInput {
  clickId: string;
  orderId: string;
  amountCents: number;
  currency: string;
}

/** Record a purchase reported by a brand. Idempotent per (brand, orderId). */
export function recordConversion(ctx: Ctx, brand: ProgramBrand, input: ConversionInput): { conversion: ReturnType<typeof publicConversion>; created: boolean } {
  const existing = ctx.db.prepare("SELECT * FROM conversions WHERE brand_id = ? AND order_id = ?").get(brand.id, input.orderId) as
    | ConversionRow
    | undefined;
  if (existing) return { conversion: publicConversion(ctx, existing, "brand"), created: false };
  if (brand.commission_bps === null) throw new AppError("CONFLICT", "Turn on your commission program in the brand dashboard first");

  const click = ctx.db
    .prepare(
      `SELECT c.created_at, t.id AS tag_id, t.brand_id, t.post_id, p.user_id AS creator_id
       FROM tag_clicks c JOIN tags t ON t.id = c.tag_id JOIN posts p ON p.id = t.post_id
       WHERE c.click_id = ?`,
    )
    .get(input.clickId) as { created_at: string; tag_id: number; brand_id: number; post_id: number; creator_id: number } | undefined;
  if (!click || click.brand_id !== brand.id) throw new AppError("NOT_FOUND", "Unknown click id for this brand");
  const windowEnd = new Date(click.created_at).getTime() + brand.attribution_days * 86_400_000;
  if (ctx.now().getTime() > windowEnd) {
    throw new AppError("VALIDATION_ERROR", `Click is older than your ${brand.attribution_days}-day attribution window`);
  }

  // A brand's own posts don't earn commission (the brand is the merchant).
  const ownPost = click.creator_id === brand.owner_id;
  const bps = ownPost ? 0 : brand.commission_bps;
  const commission = Math.round((input.amountCents * bps) / 10_000);
  const creatorCents = Math.round((commission * ctx.config.commissions.creatorSharePercent) / 100);
  const info = ctx.db
    .prepare(
      `INSERT INTO conversions (brand_id, click_id, tag_id, post_id, creator_id, order_id, amount_cents, currency,
         commission_bps, commission_cents, creator_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(brand.id, input.clickId, click.tag_id, click.post_id, click.creator_id, input.orderId, input.amountCents,
      input.currency, bps, commission, creatorCents, ctx.now().toISOString());
  const row = ctx.db.prepare("SELECT * FROM conversions WHERE id = ?").get(Number(info.lastInsertRowid)) as ConversionRow;
  return { conversion: publicConversion(ctx, row, "brand"), created: true };
}

/** Brand reports a refund/cancellation: the commission is reversed. */
export function reverseConversion(ctx: Ctx, brand: ProgramBrand, orderId: string) {
  const c = ctx.db.prepare("SELECT * FROM conversions WHERE brand_id = ? AND order_id = ?").get(brand.id, orderId) as
    | ConversionRow
    | undefined;
  if (!c) throw new AppError("NOT_FOUND", "Order not found");
  if (!c.reversed_at && statusOf(ctx, c) === "APPROVED") {
    throw new AppError("CONFLICT", "This commission is already approved and can no longer be reversed");
  }
  if (!c.reversed_at) ctx.db.prepare("UPDATE conversions SET reversed_at = ? WHERE id = ?").run(ctx.now().toISOString(), c.id);
  return publicConversion(ctx, ctx.db.prepare("SELECT * FROM conversions WHERE id = ?").get(c.id) as ConversionRow, "brand");
}

/** Totals per currency and status, e.g. { USD: { PENDING: "12.40", APPROVED: "3.10", REVERSED: "0.00" } }. */
function totals(ctx: Ctx, rows: ConversionRow[], field: "commission_cents" | "creator_cents" | "amount_cents") {
  const out: Record<string, Record<ConversionStatus, string>> = {};
  const cents: Record<string, Record<ConversionStatus, number>> = {};
  for (const r of rows) {
    cents[r.currency] ??= { PENDING: 0, APPROVED: 0, REVERSED: 0 };
    cents[r.currency]![statusOf(ctx, r)] += r[field];
  }
  for (const [cur, byStatus] of Object.entries(cents)) {
    out[cur] = { PENDING: money(byStatus.PENDING), APPROVED: money(byStatus.APPROVED), REVERSED: money(byStatus.REVERSED) };
  }
  return out;
}

export function creatorEarnings(ctx: Ctx, userId: number) {
  const rows = ctx.db
    .prepare("SELECT * FROM conversions WHERE creator_id = ? AND creator_cents > 0 ORDER BY id DESC LIMIT 200")
    .all(userId) as ConversionRow[];
  return {
    creatorSharePercent: ctx.config.commissions.creatorSharePercent,
    approvalDays: ctx.config.commissions.approvalDays,
    totals: totals(ctx, rows, "creator_cents"),
    sales: rows.map((r) => publicConversion(ctx, r, "creator")),
  };
}

export function brandSales(ctx: Ctx, userId: number) {
  const b = managedBrand(ctx, userId);
  const rows = ctx.db.prepare("SELECT * FROM conversions WHERE brand_id = ? ORDER BY id DESC LIMIT 200").all(b.id) as ConversionRow[];
  return {
    program: programSettings(ctx, b),
    salesTotals: totals(ctx, rows, "amount_cents"),
    commissionTotals: totals(ctx, rows, "commission_cents"),
    sales: rows.map((r) => publicConversion(ctx, r, "brand")),
  };
}
