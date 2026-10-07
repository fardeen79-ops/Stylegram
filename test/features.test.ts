import Database from "better-sqlite3";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { ImageAI, ImageAnalysis } from "../src/ai.js";
import { ImageRefusedError } from "../src/ai.js";
import { BASE_SCHEMA, migrate } from "../src/db.js";
import { jpeg, setup } from "./helpers.js";

/** Stand-in for Claude: red photos are "explicit", others are safe with two items. */
class FakeAI implements ImageAI {
  readonly model = "fake-model";
  calls = 0;
  failWith: Error | null = null;
  async analyze(img: Buffer): Promise<ImageAnalysis> {
    this.calls++;
    if (this.failWith) throw this.failWith;
    const { channels } = await sharp(img).stats();
    const [r, g] = [channels[0]!.mean, channels[1]!.mean];
    if (r > 200 && g < 80) {
      return { safety: { verdict: "explicit_nudity", minor_concern: false, reason: "Exposed genitals." }, items: [] };
    }
    return {
      safety: { verdict: "safe", minor_concern: false, reason: "Clothed outfit photo." },
      items: [
        { label: "Light-wash straight jeans", category: "bottom", x: 0.45, y: 0.7, brand: "Levi's" },
        { label: "White sneakers", category: "shoes", x: 1.4, y: 0.92, brand: null },
      ],
    };
  }
}

const RED = "#ff0000";
const BLUE = "#3366cc";

describe("AI photo safety", () => {
  it("blocks a post containing nudity and records the attempt without storing the image", async () => {
    const ai = new FakeAI();
    const t = setup({ ai });
    const admin = await t.user("admin");
    const amy = await t.user("amy");
    const res = await amy.post("/api/posts").attach("images", await jpeg(BLUE), "a.jpg").attach("images", await jpeg(RED), "b.jpg").expect(422);
    expect(res.body.error.code).toBe("CONTENT_REJECTED");
    expect((await t.http.get("/api/explore").expect(200)).body).toEqual([]); // nothing was posted
    const queue = (await admin.get("/api/admin/queue").expect(200)).body;
    expect(queue.blockedUploads).toEqual([expect.objectContaining({ username: "amy", verdict: "explicit_nudity" })]);
  });

  it("allows safe photos and checks each file only once", async () => {
    const ai = new FakeAI();
    const t = setup({ ai });
    const amy = await t.user("amy");
    const photo = await jpeg(BLUE);
    await amy.post("/api/ai/analyze").attach("image", photo, "a.jpg").expect(200);
    await amy.post("/api/posts").attach("images", photo, "a.jpg").expect(201);
    expect(ai.calls).toBe(1); // analysis cached by content hash
  });

  it("checks profile photos too", async () => {
    const t = setup({ ai: new FakeAI() });
    const amy = await t.user("amy");
    await amy.put("/api/me/avatar").attach("avatar", await jpeg(RED), "me.jpg").expect(422);
    await amy.put("/api/me/avatar").attach("avatar", await jpeg(BLUE), "me.jpg").expect(200);
  });

  it("fails closed when the AI can't be reached, and treats a refusal as unsafe", async () => {
    const ai = new FakeAI();
    const t = setup({ ai });
    const amy = await t.user("amy");
    ai.failWith = new Error("network down");
    const down = await amy.post("/api/posts").attach("images", await jpeg(BLUE), "a.jpg").expect(503);
    expect(down.body.error.code).toBe("AI_UNAVAILABLE");
    ai.failWith = new ImageRefusedError("declined");
    await amy.post("/api/posts").attach("images", await jpeg("#22aa55"), "b.jpg").expect(422);
  });

  it("without an API key, uploads aren't checked and suggestions are off", async () => {
    const t = setup();
    const amy = await t.user("amy");
    expect((await t.http.get("/api/ai/status").expect(200)).body).toEqual({ enabled: false });
    await amy.post("/api/ai/analyze").attach("image", await jpeg(BLUE), "a.jpg").expect(501);
    await amy.post("/api/posts").attach("images", await jpeg(RED), "a.jpg").expect(201);
  });
});

describe("AI item suggestions", () => {
  it("suggests items, matched to known brands and catalog products, with clamped positions", async () => {
    const t = setup({ ai: new FakeAI() });
    const admin = await t.user("admin");
    const levis = await t.brand("levis", "Levi's", admin);
    const prod = (await levis.post("/api/brand/products").send({ name: "501 Straight Jeans", url: "https://levi.example.com/501", category: "bottom" }).expect(201)).body;
    const amy = await t.user("amy");
    const res = await amy.post("/api/ai/analyze").attach("image", await jpeg(BLUE), "a.jpg").expect(200);
    expect(res.body.suggestions).toEqual([
      expect.objectContaining({ label: "501 Straight Jeans", category: "bottom", x: 0.45, brand: expect.objectContaining({ slug: "levi-s" }), product: expect.objectContaining({ id: prod.id }) }),
      expect.objectContaining({ label: "White sneakers", category: "shoes", x: 1, brand: null, brandName: null, product: null }),
    ]);
  });

  it("rate-limits AI requests per user", async () => {
    const t = setup({ ai: new FakeAI(), config: { ai: { model: "fake", analysesPerHour: 2 } } });
    const amy = await t.user("amy");
    for (const c of ["#111111", "#222222"]) await amy.post("/api/ai/analyze").attach("image", await jpeg(c), "a.jpg").expect(200);
    await amy.post("/api/ai/analyze").attach("image", await jpeg("#333333"), "a.jpg").expect(429);
  });
});

describe("commissions", () => {
  async function shopSetup(opts: Parameters<typeof setup>[0] = {}) {
    const t = setup(opts);
    const admin = await t.user("admin");
    const levis = await t.brand("levis", "Levi's", admin);
    const prod = (await levis.post("/api/brand/products").send({ name: "Trucker Jacket", url: "https://levi.example.com/trucker", category: "outerwear" }).expect(201)).body;
    const amy = await t.user("amy");
    const post = (await t.post(amy, [{ image: 0, x: 0.5, y: 0.4, label: "Jacket", category: "outerwear", brandSlug: "levi-s", productId: prod.id }]).expect(201)).body;
    const tag = post.images[0].tags[0];
    const click = async () => {
      const r = await t.http.get(tag.shopUrl).expect(302);
      return new URL(r.headers.location!).searchParams.get("sg_click")!;
    };
    return { t, levis, amy, post, tag, click };
  }

  it("records a purchase, splits the commission with the creator, and is idempotent", async () => {
    const { t, levis, amy, click } = await shopSetup();
    await levis.put("/api/brand/program").send({ commissionPercent: 12.5, attributionDays: 30 }).expect(200);
    const { apiKey } = (await levis.post("/api/brand/api-key").expect(201)).body;
    expect(apiKey).toMatch(/^sgk_/);
    const clickId = await click();
    expect(clickId).toMatch(/^sgc_/);

    const api = () => t.http.post("/api/v1/conversions").set("Authorization", `Bearer ${apiKey}`);
    const order = { clickId, orderId: "ORD-1001", amount: "120.00", currency: "usd" };
    const first = await api().send(order).expect(201);
    expect(first.body).toMatchObject({ amount: "120.00", currency: "USD", commission: "15.00", creatorEarnings: "7.50", status: "PENDING", creator: "amy" });
    const again = await api().send(order).expect(200);
    expect(again.body.id).toBe(first.body.id);

    const earnings = (await amy.get("/api/me/earnings").expect(200)).body;
    expect(earnings.totals).toEqual({ USD: { PENDING: "7.50", APPROVED: "0.00", REVERSED: "0.00" } });
    expect(earnings.sales[0]).not.toHaveProperty("orderId");

    t.advance(31 * 86_400_000);
    const sales = (await levis.get("/api/brand/sales").expect(200)).body;
    expect(sales.commissionTotals.USD.APPROVED).toBe("15.00");
    await t.http.post("/api/v1/conversions/ORD-1001/reverse").set("Authorization", `Bearer ${apiKey}`).expect(409);
  });

  it("reverses refunded orders and rejects bad keys, unknown clicks and stale clicks", async () => {
    const { t, levis, click } = await shopSetup();
    await levis.put("/api/brand/program").send({ commissionPercent: 10 }).expect(200);
    const { apiKey } = (await levis.post("/api/brand/api-key").expect(201)).body;
    const api = (key = apiKey) => t.http.post("/api/v1/conversions").set("Authorization", `Bearer ${key}`);
    const clickId = await click();

    await api("sgk_wrong").send({ clickId, orderId: "X", amount: 10, currency: "USD" }).expect(401);
    await api().send({ clickId: "sgc_nope", orderId: "X", amount: 10, currency: "USD" }).expect(404);
    await api().send({ clickId, orderId: "X", amount: "ten", currency: "USD" }).expect(400);

    await api().send({ clickId, orderId: "R-1", amount: 50, currency: "EUR" }).expect(201);
    const rev = await t.http.post("/api/v1/conversions/R-1/reverse").set("Authorization", `Bearer ${apiKey}`).expect(200);
    expect(rev.body.status).toBe("REVERSED");

    const old = await click();
    t.advance(31 * 86_400_000);
    await api().send({ clickId: old, orderId: "LATE", amount: 10, currency: "USD" }).expect(400);

    // Rotating the key invalidates the old one.
    await levis.post("/api/brand/api-key").expect(201);
    await api().send({ clickId, orderId: "Y", amount: 10, currency: "USD" }).expect(401);
  });

  it("needs the program switched on, and a brand's click can't be claimed by another brand", async () => {
    const { t, levis, click } = await shopSetup();
    const admin = (await t.http.post("/api/auth/login").send({ login: "admin", password: "password123" }).expect(200)).body.token;
    const { apiKey } = (await levis.post("/api/brand/api-key").expect(201)).body;
    const clickId = await click();
    await t.http.post("/api/v1/conversions").set("Authorization", `Bearer ${apiKey}`).send({ clickId, orderId: "A", amount: 10, currency: "USD" }).expect(409);

    const adminUser = { post: (u: string) => t.http.post(u).set("Authorization", `Bearer ${admin}`) };
    const other = await t.user("cos_hq", { accountType: "BRAND", brand: { name: "COS", website: "https://cos.example.com" } });
    await adminUser.post("/api/admin/brands/cos/verify").send({ verified: true }).expect(204);
    await other.put("/api/brand/program").send({ commissionPercent: 10 }).expect(200);
    const otherKey = (await other.post("/api/brand/api-key").expect(201)).body.apiKey;
    await t.http.post("/api/v1/conversions").set("Authorization", `Bearer ${otherKey}`).send({ clickId, orderId: "B", amount: 10, currency: "USD" }).expect(404);
  });

  it("pays no commission on a brand's own posts", async () => {
    const t = setup();
    const admin = await t.user("admin");
    const levis = await t.brand("levis", "Levi's", admin);
    await levis.put("/api/brand/program").send({ commissionPercent: 10 }).expect(200);
    const { apiKey } = (await levis.post("/api/brand/api-key").expect(201)).body;
    const post = (await t.post(levis, [{ image: 0, x: 0.5, y: 0.5, label: "Jacket", category: "outerwear", brandSlug: "levi-s" }]).expect(201)).body;
    const r = await t.http.get(post.images[0].tags[0].shopUrl).expect(302);
    const clickId = new URL(r.headers.location!).searchParams.get("sg_click");
    const conv = await t.http.post("/api/v1/conversions").set("Authorization", `Bearer ${apiKey}`).send({ clickId, orderId: "O", amount: 100, currency: "USD" }).expect(201);
    expect(conv.body).toMatchObject({ commission: "0.00", creatorEarnings: "0.00" });
  });

  it("sends brands without a program through the affiliate network link, with the click id", async () => {
    const template = "https://go.network.example/?id=PUB&url={url}&sub={click}";
    const { t, tag } = await shopSetup({ config: { commissions: { creatorSharePercent: 50, approvalDays: 30, affiliateLinkTemplate: template } } });
    const r = await t.http.get(tag.shopUrl).expect(302);
    const dest = new URL(r.headers.location!);
    expect(dest.hostname).toBe("go.network.example");
    expect(dest.searchParams.get("sub")).toMatch(/^sgc_/);
    const inner = new URL(dest.searchParams.get("url")!);
    expect(inner.hostname).toBe("levi.example.com");
    expect(inner.searchParams.get("sg_click")).toBe(dest.searchParams.get("sub"));
  });

  it("shows shoppers whether a tag can earn commission", async () => {
    const { t, levis, post } = await shopSetup();
    expect((await t.http.get(`/api/posts/${post.id}`).expect(200)).body.images[0].tags[0].earnsCommission).toBe(false);
    await levis.put("/api/brand/program").send({ commissionPercent: 8 }).expect(200);
    expect((await t.http.get(`/api/posts/${post.id}`).expect(200)).body.images[0].tags[0].earnsCommission).toBe(true);
  });
});

describe("database migrations", () => {
  it("upgrades a database created before commissions existed, keeping its data", () => {
    const db = new Database(":memory:");
    db.exec(BASE_SCHEMA);
    db.prepare("INSERT INTO brands (slug, name, created_at) VALUES ('old', 'Old Brand', '2026-01-01')").run();
    migrate(db);
    migrate(db); // idempotent
    expect(db.pragma("user_version", { simple: true })).toBe(3);
    const brand = db.prepare("SELECT slug, commission_bps, attribution_days, trade_licence FROM brands").get();
    expect(brand).toEqual({ slug: "old", commission_bps: null, attribution_days: 30, trade_licence: null });
    expect(db.prepare("SELECT COUNT(*) AS n FROM conversions").get()).toEqual({ n: 0 });
  });
});

describe("UAE market", () => {
  it("prices products in AED by default and offers modest-wear categories", async () => {
    const t = setup();
    expect((await t.http.get("/api/market").expect(200)).body).toMatchObject({ country: "AE", currency: "AED", locale: "en-AE" });
    expect((await t.http.get("/api/categories").expect(200)).body).toEqual(expect.arrayContaining(["abaya", "kandura", "scarf"]));
    const admin = await t.user("admin");
    const brand = await t.brand("saffron", "Saffron & Sand", admin);
    const p = (await brand.post("/api/brand/products").send({ name: "Midnight Crepe Abaya", url: "https://saffron.example/abaya", price: 650, category: "abaya" }).expect(201)).body;
    expect(p).toMatchObject({ price: "650.00", currency: "AED", category: "abaya" });
  });

  it("shows admins the trade licence number for brand sign-ups and claims", async () => {
    const t = setup();
    const admin = await t.user("admin");
    await t.user("dune_hq", { accountType: "BRAND", brand: { name: "Dune Footwear", website: "https://dune.example", tradeLicence: "DED-123456" } });
    const amy = await t.user("amy");
    await t.post(amy, [{ image: 0, x: 0.5, y: 0.5, label: "Bag", category: "bag", brandName: "Al Seef Leather" }]).expect(201);
    await t.user("alseef_hq", { accountType: "BRAND", brand: { name: "Al Seef Leather", website: "https://alseef.example", tradeLicence: "SHJ-9876" } });
    const q = (await admin.get("/api/admin/queue").expect(200)).body;
    expect(q.brandsToVerify[0]).toMatchObject({ name: "Dune Footwear", tradeLicence: "DED-123456" });
    expect(q.claims[0]).toMatchObject({ name: "Al Seef Leather", tradeLicence: "SHJ-9876" });
  });
});
