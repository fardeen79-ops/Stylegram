import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { jpeg, setup } from "./helpers.js";

const jacket = { image: 0, x: 0.4, y: 0.35, label: "Denim jacket", category: "outerwear" };

describe("accounts", () => {
  it("registers personal accounts and logs in by username or email", async () => {
    const t = setup();
    const amy = await t.user("amy");
    expect(amy.body.user).toMatchObject({ username: "amy", accountType: "PERSONAL", isAdmin: false });
    await t.http.post("/api/auth/login").send({ login: "AMY", password: "password123" }).expect(200);
    await t.http.post("/api/auth/login").send({ login: "amy@example.com", password: "password123" }).expect(200);
    await t.http.post("/api/auth/login").send({ login: "amy", password: "nope-nope" }).expect(401);
    await t.http
      .post("/api/auth/register")
      .send({ username: "amy", email: "x@example.com", password: "password123", displayName: "x" })
      .expect(409);
  });

  it("follows and unfollows", async () => {
    const t = setup();
    const amy = await t.user("amy");
    await t.user("ben");
    await amy.put("/api/users/ben/follow").expect(204);
    expect((await amy.get("/api/users/ben").expect(200)).body).toMatchObject({ followers: 1, isFollowing: true });
    await amy.put("/api/users/amy/follow").expect(400);
    await amy.del("/api/users/ben/follow").expect(204);
    expect((await amy.get("/api/users/ben").expect(200)).body.followers).toBe(0);
  });
});

describe("posting photos", () => {
  it("re-encodes uploads, strips metadata and makes thumbnails", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const res = await amy
      .post("/api/posts")
      .field("caption", "Sunday fit")
      .attach("images", await jpeg("#36c", 2000, 2500, true), "big.jpg")
      .expect(201);
    const img = res.body.images[0];
    expect(img).toMatchObject({ width: 1440, height: 1800 });
    const file = readFileSync(join(t.uploadDir, img.url.replace("/media/", "")));
    const meta = await sharp(file).metadata();
    expect(meta.exif).toBeUndefined();
    const thumb = await sharp(readFileSync(join(t.uploadDir, img.thumbUrl.replace("/media/", "")))).metadata();
    expect([thumb.width, thumb.height]).toEqual([480, 480]);
    await t.http.get(img.url).expect(200).expect("content-type", /image\/jpeg/);
  });

  it("rejects files that aren't images", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const res = await amy.post("/api/posts").attach("images", Buffer.from("<script>alert(1)</script>"), "x.jpg").expect(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA");
    await amy.post("/api/posts").field("caption", "no photo").expect(400);
  });

  it("supports carousels with tags on each photo", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const res = await t
      .post(amy, [
        { ...jacket, brandName: "Levi's" },
        { image: 1, x: 0.5, y: 0.9, label: "White sneakers", category: "shoes", brandName: "Veja", url: "https://veja.example.com/v10" },
      ], 2)
      .expect(201);
    expect(res.body.images).toHaveLength(2);
    expect(res.body.images[0].tags[0]).toMatchObject({ label: "Denim jacket", status: "PENDING", brand: { slug: "levi-s", verified: false } });
    expect(res.body.images[1].tags[0].shopUrl).toMatch(/^\/t\/\d+$/);
    // Levi's has no website and no product link yet, so there's nothing to shop.
    expect(res.body.images[0].tags[0].shopUrl).toBeNull();
  });

  it("validates tags", async () => {
    const t = setup();
    const amy = await t.user("amy");
    await t.post(amy, [{ ...jacket, image: 3, brandName: "Zara" }]).expect(400);
    await t.post(amy, [{ ...jacket, x: 1.5, brandName: "Zara" }]).expect(400);
    await t.post(amy, [{ ...jacket }]).expect(400); // no brand
    await t.post(amy, [{ ...jacket, brandName: "Zara", url: "javascript:alert(1)" }]).expect(400);
    await t.post(amy, [{ ...jacket, brandName: "Zara", category: "spaceship" }]).expect(400);
  });

  it("reuses the same community brand for different spellings", async () => {
    const t = setup();
    const amy = await t.user("amy");
    await t.post(amy, [{ ...jacket, brandName: "H&M" }]).expect(201);
    await t.post(amy, [{ ...jacket, brandName: "h & m" }]).expect(201);
    const brands = (await t.http.get("/api/brands?q=h").expect(200)).body;
    expect(brands.filter((b: { slug: string }) => b.slug === "h-and-m")).toHaveLength(1);
  });

  it("lets only the owner edit tags and delete the post", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const ben = await t.user("ben");
    const p = (await t.post(amy).expect(201)).body;
    const imageId = p.images[0].id;
    await ben.post(`/api/posts/${p.id}/tags`).send({ ...jacket, imageId, brandName: "Zara" }).expect(403);
    const tagged = await amy.post(`/api/posts/${p.id}/tags`).send({ ...jacket, imageId, brandName: "Zara" }).expect(201);
    const tagId = tagged.body.images[0].tags[0].id;
    await ben.del(`/api/tags/${tagId}`).expect(403);
    await amy.del(`/api/tags/${tagId}`).expect(204);
    await ben.del(`/api/posts/${p.id}`).expect(403);
    await amy.del(`/api/posts/${p.id}`).expect(204);
    await t.http.get(`/api/posts/${p.id}`).expect(404);
    await t.http.get(p.images[0].url).expect(404); // files removed too
  });
});

describe("brands", () => {
  it("brand accounts must be verified before managing a catalog", async () => {
    const t = setup();
    const admin = await t.user("admin");
    expect(admin.body.user.isAdmin).toBe(true);
    const zara = await t.user("zara_official", { accountType: "BRAND", brand: { name: "Zara", website: "https://zara.example.com" } });
    expect(zara.body.brand).toEqual({ slug: "zara", status: "VERIFICATION_PENDING" });
    const product = { name: "Linen shirt", url: "https://zara.example.com/linen", price: 39.9, currency: "EUR", category: "top" };
    await zara.post("/api/brand/products").send(product).expect(403);

    const queue = (await admin.get("/api/admin/queue").expect(200)).body;
    expect(queue.brandsToVerify.map((b: { slug: string }) => b.slug)).toEqual(["zara"]);
    await zara.post("/api/admin/brands/zara/verify").send({ verified: true }).expect(403); // not an admin
    await admin.post("/api/admin/brands/zara/verify").send({ verified: true }).expect(204);

    const created = await zara.post("/api/brand/products").send(product).expect(201);
    expect(created.body).toMatchObject({ name: "Linen shirt", price: "39.90", currency: "EUR" });
    const list = (await t.http.get("/api/brands/zara/products").expect(200)).body;
    expect(list).toHaveLength(1);
  });

  it("lets a business claim a community brand, approved by an admin", async () => {
    const t = setup();
    const admin = await t.user("admin");
    const amy = await t.user("amy");
    await t.post(amy, [{ ...jacket, brandName: "Arket" }]).expect(201);
    expect((await t.http.get("/api/brands/arket").expect(200)).body).toMatchObject({ claimed: false, verified: false });

    const arket = await t.user("arket_hq", { accountType: "BRAND", brand: { name: "ARKET", website: "https://arket.example.com" } });
    expect(arket.body.brand.status).toBe("CLAIM_PENDING");
    const queue = (await admin.get("/api/admin/queue").expect(200)).body;
    expect(queue.claims).toHaveLength(1);
    await admin.post(`/api/admin/claims/${queue.claims[0].id}`).send({ approve: true }).expect(204);

    expect((await t.http.get("/api/brands/arket").expect(200)).body).toMatchObject({
      claimed: true,
      verified: true,
      account: { username: "arket_hq" },
      tagCount: 1,
    });
    // The brand now sees the existing tag in its review queue.
    const tags = (await arket.get("/api/brand/tags?status=PENDING").expect(200)).body;
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatchObject({ label: "Denim jacket", author: "amy" });
  });

  it("brands confirm tags (correcting them to a product) or reject them", async () => {
    const t = setup();
    const admin = await t.user("admin");
    const levis = await t.brand("levis", "Levi's", admin);
    const prod = (
      await levis.post("/api/brand/products").send({ name: "Trucker Jacket", url: "https://levi.example.com/trucker", price: 98, category: "outerwear" }).expect(201)
    ).body;
    const amy = await t.user("amy");
    const ben = await t.user("ben");
    const p = (
      await t.post(amy, [{ ...jacket, brandSlug: "levi-s" }, { image: 0, x: 0.5, y: 0.7, label: "Belt", category: "accessory", brandSlug: "levi-s" }]).expect(201)
    ).body;
    const [jacketTag, beltTag] = p.images[0].tags;

    await amy.post(`/api/brand/tags/${jacketTag.id}/review`).send({ action: "CONFIRM" }).expect(403); // not the brand
    await levis.post(`/api/brand/tags/${jacketTag.id}/review`).send({ action: "CONFIRM", productId: prod.id }).expect(204);
    await levis.post(`/api/brand/tags/${beltTag.id}/review`).send({ action: "REJECT" }).expect(204);

    const publicView = (await ben.get(`/api/posts/${p.id}`).expect(200)).body;
    expect(publicView.images[0].tags).toHaveLength(1);
    expect(publicView.images[0].tags[0]).toMatchObject({
      status: "CONFIRMED",
      product: { name: "Trucker Jacket", price: "98.00" },
      brand: { verified: true },
    });
    // The author still sees the rejected tag so they can fix it.
    const ownerView = (await amy.get(`/api/posts/${p.id}`).expect(200)).body;
    expect(ownerView.images[0].tags.map((x: { status: string }) => x.status)).toEqual(["CONFIRMED", "REJECTED"]);
  });

  it("refuses to tag another brand's product", async () => {
    const t = setup();
    const admin = await t.user("admin");
    const levis = await t.brand("levis", "Levi's", admin);
    const prod = (await levis.post("/api/brand/products").send({ name: "501", url: "https://levi.example.com/501", category: "bottom" }).expect(201)).body;
    const amy = await t.user("amy");
    await t.post(amy, [{ ...jacket, brandName: "Wrangler", productId: prod.id }]).expect(400);
  });

  it("auto-confirms a verified brand tagging itself", async () => {
    const t = setup();
    const admin = await t.user("admin");
    const levis = await t.brand("levis", "Levi's", admin);
    const p = (await t.post(levis, [{ ...jacket, brandSlug: "levi-s" }]).expect(201)).body;
    expect(p.images[0].tags[0].status).toBe("CONFIRMED");
    expect(p.author.brand).toEqual({ slug: "levi-s", verified: true });
  });

  it("tracks shop clicks and reports them on the dashboard", async () => {
    const t = setup();
    const admin = await t.user("admin");
    const levis = await t.brand("levis", "Levi's", admin);
    const prod = (
      await levis.post("/api/brand/products").send({ name: "Trucker Jacket", url: "https://levi.example.com/trucker?color=blue", category: "outerwear" }).expect(201)
    ).body;
    const amy = await t.user("amy");
    const p = (await t.post(amy, [{ ...jacket, brandSlug: "levi-s", productId: prod.id }]).expect(201)).body;
    const tag = p.images[0].tags[0];

    const res = await t.http.get(tag.shopUrl).expect(302);
    const dest = new URL(res.headers.location!);
    expect(dest.origin + dest.pathname).toBe("https://levi.example.com/trucker");
    expect(dest.searchParams.get("color")).toBe("blue");
    expect(dest.searchParams.get("utm_source")).toBe("coppit");
    expect(dest.searchParams.get("utm_campaign")).toBe(`post_${p.id}`);
    await t.http.get(tag.shopUrl).expect(302);
    t.advance(10 * 86_400_000);
    await t.http.get(tag.shopUrl).expect(302);

    const dash = (await levis.get("/api/brand/dashboard").expect(200)).body;
    expect(dash).toMatchObject({ tags: { total: 1, pending: 1 }, posts: 1, creators: 1, clicks: { last7Days: 1, last30Days: 3 } });
    expect(dash.topProducts[0]).toMatchObject({ name: "Trucker Jacket", tags: 1, clicks: 3 });

    await levis.post(`/api/brand/tags/${tag.id}/review`).send({ action: "REJECT" }).expect(204);
    await t.http.get(tag.shopUrl).expect(404); // rejected tags no longer link out
  });

  it("falls back to the brand website for the shop link", async () => {
    const t = setup();
    const admin = await t.user("admin");
    await t.brand("cos", "COS", admin, "https://cos.example.com");
    const amy = await t.user("amy");
    const p = (await t.post(amy, [{ ...jacket, brandSlug: "cos" }]).expect(201)).body;
    const res = await t.http.get(p.images[0].tags[0].shopUrl).expect(302);
    expect(res.headers.location).toMatch(/^https:\/\/cos\.example\.com\/\?utm_source=coppit/);
  });

  it("shows a brand's 'seen on' posts, filterable by product", async () => {
    const t = setup();
    const admin = await t.user("admin");
    const levis = await t.brand("levis", "Levi's", admin);
    const prod = (await levis.post("/api/brand/products").send({ name: "501", url: "https://levi.example.com/501", category: "bottom" }).expect(201)).body;
    const amy = await t.user("amy");
    const p1 = (await t.post(amy, [{ ...jacket, brandSlug: "levi-s" }]).expect(201)).body;
    const p2 = (await t.post(amy, [{ ...jacket, label: "Jeans", category: "bottom", brandSlug: "levi-s", productId: prod.id }]).expect(201)).body;
    await t.post(amy, [{ ...jacket, brandName: "Other" }]).expect(201);
    expect((await t.http.get("/api/brands/levi-s/posts").expect(200)).body.map((c: { id: number }) => c.id)).toEqual([p2.id, p1.id]);
    expect((await t.http.get(`/api/brands/levi-s/posts?product=${prod.id}`).expect(200)).body.map((c: { id: number }) => c.id)).toEqual([p2.id]);
  });
});

describe("feed, explore and engagement", () => {
  it("shows followed users' posts in the feed, newest first, with a cursor", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const ben = await t.user("ben");
    const cat = await t.user("cat");
    await amy.put("/api/users/ben/follow").expect(204);
    const b1 = (await t.post(ben).expect(201)).body;
    await t.post(cat).expect(201);
    const b2 = (await t.post(ben).expect(201)).body;
    const a1 = (await t.post(amy).expect(201)).body;
    const page1 = (await amy.get("/api/feed?limit=2").expect(200)).body;
    expect(page1.map((p: { id: number }) => p.id)).toEqual([a1.id, b2.id]);
    const page2 = (await amy.get(`/api/feed?limit=2&before=${b2.id}`).expect(200)).body;
    expect(page2.map((p: { id: number }) => p.id)).toEqual([b1.id]);
  });

  it("explores by category and search", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const shoes = (await t.post(amy, [{ ...jacket, label: "Chelsea boots", category: "shoes", brandName: "Dr. Martens" }]).expect(201)).body;
    const coat = (await t.post(amy, [{ ...jacket, brandName: "Uniqlo" }], 1, "Rainy day").expect(201)).body;
    expect((await t.http.get("/api/explore?category=shoes").expect(200)).body.map((p: { id: number }) => p.id)).toEqual([shoes.id]);
    expect((await t.http.get("/api/explore?q=uniqlo").expect(200)).body.map((p: { id: number }) => p.id)).toEqual([coat.id]);
    expect((await t.http.get("/api/explore?q=rainy").expect(200)).body.map((p: { id: number }) => p.id)).toEqual([coat.id]);
  });

  it("likes, saves and comments", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const ben = await t.user("ben");
    const p = (await t.post(amy).expect(201)).body;
    await ben.put(`/api/posts/${p.id}/like`).expect(204);
    await ben.put(`/api/posts/${p.id}/like`).expect(204); // idempotent
    await ben.put(`/api/posts/${p.id}/save`).expect(204);
    const c = (await ben.post(`/api/posts/${p.id}/comments`).send({ body: "Love the jacket!" }).expect(201)).body;
    const view = (await ben.get(`/api/posts/${p.id}`).expect(200)).body;
    expect(view).toMatchObject({ likes: 1, comments: 1, likedByMe: true, savedByMe: true });
    expect((await ben.get("/api/me/saved").expect(200)).body.map((x: { id: number }) => x.id)).toEqual([p.id]);
    // Post owner can remove comments on their post.
    await amy.del(`/api/comments/${c.id}`).expect(204);
    await ben.del(`/api/posts/${p.id}/like`).expect(204);
    expect((await t.http.get(`/api/posts/${p.id}`).expect(200)).body).toMatchObject({ likes: 0, comments: 0, likedByMe: false });
  });

  it("sets an avatar", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const res = await amy.put("/api/me/avatar").attach("avatar", await jpeg("#0a0", 900, 600), "me.jpg").expect(200);
    const meta = await sharp(readFileSync(join(t.uploadDir, res.body.avatarUrl.replace("/media/", "")))).metadata();
    expect([meta.width, meta.height]).toEqual([320, 320]);
    expect((await t.http.get("/api/users/amy").expect(200)).body.avatarUrl).toBe(res.body.avatarUrl);
  });
});

describe("social context", () => {
  it("shows who liked a post (preferring people you follow) and the latest comments", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const ben = await t.user("ben");
    const cat = await t.user("cat");
    const viewer = await t.user("viewer");
    await viewer.put("/api/users/ben/follow").expect(204);
    const p = (await t.post(amy).expect(201)).body;
    await ben.put(`/api/posts/${p.id}/like`).expect(204);
    t.advance(1000);
    await cat.put(`/api/posts/${p.id}/like`).expect(204);
    for (const [u, body] of [[ben, "one"], [cat, "two"], [ben, "three"]] as const) {
      await u.post(`/api/posts/${p.id}/comments`).send({ body }).expect(201);
    }
    const view = (await viewer.get(`/api/posts/${p.id}`).expect(200)).body;
    expect(view.likedBy.username).toBe("ben"); // followed beats more recent
    expect((await t.http.get(`/api/posts/${p.id}`).expect(200)).body.likedBy.username).toBe("cat"); // most recent
    expect(view.recentComments.map((c: { body: string }) => c.body)).toEqual(["two", "three"]);
  });

  it("lists who you follow and suggests accounts with posts", async () => {
    const t = setup();
    const amy = await t.user("amy");
    const ben = await t.user("ben");
    const cat = await t.user("cat");
    await t.user("lurker"); // no posts, never suggested
    await t.post(ben).expect(201);
    await t.post(cat).expect(201);
    await ben.put("/api/users/cat/follow").expect(204);
    await amy.put("/api/users/ben/follow").expect(204);
    expect((await amy.get("/api/me/following").expect(200)).body.map((u: { username: string }) => u.username)).toEqual(["ben"]);
    const sugg = (await amy.get("/api/me/suggestions").expect(200)).body;
    expect(sugg).toEqual([expect.objectContaining({ username: "cat", reason: "Followed by 1 you follow" })]);
  });
});

describe("production admin setup", () => {
  it("never grants admin by username at registration when no admin usernames are configured", async () => {
    const t = setup();
    t.ctx.config.adminUsernames = []; // production behaviour
    const admin = await t.user("admin");
    expect(admin.body.user.isAdmin).toBe(false);
  });

  it("creates the configured admin, and won't promote someone else who took the name", async () => {
    const { ensureAdmin } = await import("../src/bootstrap.js");
    const t = setup();
    t.ctx.config.adminUsernames = [];
    const quiet = { log: () => {}, error: () => {} } as unknown as Console;
    ensureAdmin(t.ctx, "Owner", "correct horse battery", quiet);
    const ok = await t.http.post("/api/auth/login").send({ login: "owner", password: "correct horse battery" }).expect(200);
    expect(ok.body.user.isAdmin).toBe(true);

    const squatter = await t.user("boss");
    ensureAdmin(t.ctx, "boss", "some other long password", quiet);
    expect((await squatter.get("/api/me").expect(200)).body.isAdmin).toBe(false);
    ensureAdmin(t.ctx, "x", "short", quiet); // invalid input is ignored
  });
});
