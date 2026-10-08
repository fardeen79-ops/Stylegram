import { afterEach, describe, expect, it, vi } from "vitest";
import { repairDemoPhotos, seedDemo } from "../src/demo.js";
import { jpeg, setup } from "./helpers.js";

const quiet = { log: () => {}, warn: () => {} };
afterEach(() => vi.unstubAllGlobals());

describe("demo photos", () => {
  it("sends browser-like requests, falls back to placeholders, and repairs them on a later start", async () => {
    const { ctx } = setup();
    const seen: { url: string; ua: string | null }[] = [];
    let unsplashUp = false;
    const photo = await jpeg("#3a6", 1200, 1500);
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      seen.push({ url, ua: new Headers(init?.headers).get("user-agent") });
      if (!unsplashUp) return new Response("Forbidden", { status: 403 });
      if (url.includes("/napi/photos/")) {
        const id = url.split("/").pop();
        return Response.json({ urls: { raw: `https://images.unsplash.com/photo-${id}?ixid=abc` } });
      }
      if (url.startsWith("https://images.unsplash.com/")) return new Response(photo, { headers: { "Content-Type": "image/jpeg" } });
      return new Response("Not found", { status: 404 });
    });

    await seedDemo(ctx, { password: "password123", log: quiet });
    const total = (ctx.db.prepare("SELECT COUNT(*) AS n FROM post_images").get() as { n: number }).n;
    const placeholders = () => (ctx.db.prepare("SELECT COUNT(*) AS n FROM demo_placeholders").get() as { n: number }).n;
    expect(total).toBeGreaterThan(10);
    expect(placeholders()).toBe(total);
    expect(seen.every((s) => s.ua?.startsWith("Mozilla/5.0"))).toBe(true);

    const before = ctx.db.prepare("SELECT path, width, height FROM post_images ORDER BY id").all() as { path: string; width: number; height: number }[];
    unsplashUp = true;
    seen.length = 0;
    expect(await repairDemoPhotos(ctx, quiet)).toBe(total);
    expect(placeholders()).toBe(0);
    const after = ctx.db.prepare("SELECT path, width, height FROM post_images ORDER BY id").all() as typeof before;
    expect(after.every((a, i) => a.path !== before[i]!.path)).toBe(true);
    expect(after[0]).toMatchObject({ width: 1200, height: 1500 }); // the real photo, not the 1080×1350 placeholder
    const cdn = seen.find((s) => s.url.startsWith("https://images.unsplash.com/"))!;
    expect(new URL(cdn.url).searchParams.get("w")).toBe("1600");

    // Nothing left to fix: no more requests.
    seen.length = 0;
    expect(await repairDemoPhotos(ctx, quiet)).toBe(0);
    expect(seen).toHaveLength(0);
  }, 60_000);
});

describe("shopping discovery data", () => {
  it("lists trending brands, shop info on grid cards, product photos from looks and who wears a brand", async () => {
    const { ctx, http } = setup();
    vi.stubGlobal("fetch", async () => new Response("Forbidden", { status: 403 }));
    await seedDemo(ctx, { password: "password123", log: quiet });

    const trending = (await http.get("/api/brands/trending").expect(200)).body;
    expect(trending[0]).toMatchObject({ slug: "al-seef-leather", verified: true, looks: 3 });
    expect(trending[0].coverUrl).toMatch(/^\/media\/.+_t\.jpg$/);

    const cards = (await http.get("/api/brands/saffron-and-sand/posts").expect(200)).body;
    expect(cards[0].shop).toEqual({ brand: "Saffron & Sand", price: "650.00", currency: "AED" });

    const products = (await http.get("/api/brands/saffron-and-sand/products").expect(200)).body;
    const abaya = products.find((p: { name: string }) => p.name === "Midnight Crepe Abaya");
    expect(abaya.look).toMatchObject({ x: 0.5, y: 0.5 });
    expect(abaya.look.imageUrl).toMatch(/^\/media\//);
    expect(products.find((p: { name: string }) => p.name === "Kaftan Dress – Rose").look).toBeNull();

    const brand = (await http.get("/api/brands/al-seef-leather").expect(200)).body;
    expect(brand.creators.map((u: { username: string }) => u.username).sort()).toEqual(["noor.styles", "priya.wears"]);
  }, 60_000);
});
