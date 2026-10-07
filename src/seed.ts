/**
 * Demo data: an admin, three verified (fictional) brands with catalogs, a few creators and
 * tagged outfit posts with generated illustrations. Run with `npm run seed` on an empty DB.
 * Every account's password is "password123".
 */
import sharp from "sharp";
import { config } from "./config.js";
import type { Ctx } from "./context.js";
import { openDb } from "./db.js";
import { storeImage } from "./media.js";
import { createProduct, verifyBrand } from "./services/brands.js";
import { addComment, createPost, setLike, type TagInput } from "./services/posts.js";
import { follow, registerUser, updateProfile } from "./services/users.js";

const ctx: Ctx = { db: openDb(config.dbPath), config: { ...config, adminUsernames: ["admin"] }, now: () => new Date() };
if ((ctx.db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n > 0) {
  console.error(`${config.dbPath} already has data; seed an empty database (set DB_PATH or delete the file).`);
  process.exit(1);
}

const PASSWORD = "password123";
const person = (username: string, displayName: string, bio: string) => {
  const { user } = registerUser(ctx, { username, email: `${username}@example.com`, password: PASSWORD, displayName, accountType: "PERSONAL" });
  updateProfile(ctx, user.id, { bio });
  return user;
};
const brandAccount = (username: string, name: string, website: string, description: string) => {
  const { user, brand } = registerUser(ctx, {
    username, email: `${username}@example.com`, password: PASSWORD, displayName: name, accountType: "BRAND", brand: { name, website },
  });
  verifyBrand(ctx, admin.id, brand!.slug, true);
  ctx.db.prepare("UPDATE brands SET description = ? WHERE slug = ?").run(description, brand!.slug);
  return { user, slug: brand!.slug };
};

/** A simple flat illustration of an outfit, so the demo has images without stock photos. */
async function outfit(bg: string, top: string, bottom: string, shoes: string, extra: "bag" | "glasses" | "hat"): Promise<Buffer> {
  const extras = {
    bag: `<rect x="560" y="560" width="150" height="130" rx="18" fill="#8b5e34"/><path d="M590 560 q45 -70 90 0" stroke="#5c3b1e" stroke-width="12" fill="none"/>`,
    glasses: `<g fill="none" stroke="#111" stroke-width="10"><circle cx="372" cy="232" r="28"/><circle cx="452" cy="232" r="28"/><line x1="400" y1="232" x2="424" y2="232"/></g>`,
    hat: `<ellipse cx="412" cy="170" rx="120" ry="22" fill="#2f2a26"/><rect x="342" y="105" width="140" height="70" rx="25" fill="#2f2a26"/>`,
  };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="824" height="1030" viewBox="0 0 824 1030">
    <rect width="824" height="1030" fill="${bg}"/>
    <circle cx="412" cy="235" r="78" fill="#e9b99a"/>
    <path d="M262 360 q150 -60 300 0 l40 300 h-380z" fill="${top}"/>
    <rect x="300" y="650" width="100" height="270" rx="20" fill="${bottom}"/>
    <rect x="424" y="650" width="100" height="270" rx="20" fill="${bottom}"/>
    <rect x="282" y="910" width="130" height="50" rx="22" fill="${shoes}"/>
    <rect x="412" y="910" width="130" height="50" rx="22" fill="${shoes}"/>
    ${extras[extra]}
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

const admin = registerUser(ctx, { username: "admin", email: "admin@example.com", password: PASSWORD, displayName: "Admin", accountType: "PERSONAL" }).user;

const northwind = brandAccount("northwind", "Northwind Denim", "https://northwind.example.com", "Raw selvedge denim, made to fade.");
const mare = brandAccount("ateliermare", "Atelier Mare", "https://mare.example.com", "Linen and leather goods from the coast.");
const kite = brandAccount("kitefootwear", "Kite Footwear", "https://kite.example.com", "Everyday sneakers.");

const p = (owner: number, name: string, path: string, price: number, category: Parameters<typeof createProduct>[2]["category"]) =>
  createProduct(ctx, owner, { name, url: `https://${path}`, priceCents: price * 100, currency: "USD", category });
const trucker = p(northwind.user.id, "Trucker Jacket – Indigo", "northwind.example.com/trucker", 148, "outerwear");
const straight = p(northwind.user.id, "Straight Jean – Rinse", "northwind.example.com/straight", 128, "bottom");
p(northwind.user.id, "Denim Shirt", "northwind.example.com/shirt", 98, "top");
const tote = p(mare.user.id, "Market Tote", "mare.example.com/tote", 210, "bag");
const linen = p(mare.user.id, "Linen Overshirt – Sand", "mare.example.com/overshirt", 165, "top");
const runner = p(kite.user.id, "Runner 01 – White", "kite.example.com/runner-01", 120, "shoes");
const court = p(kite.user.id, "Court Low – Black", "kite.example.com/court-low", 110, "shoes");

const maya = person("maya.styles", "Maya Chen", "Thrift + denim forever 🧵");
const leo = person("leo_fits", "Leo Martins", "Menswear notes from Lisbon");
const sara = person("sara.wears", "Sara Okafor", "Colour, always.");

for (const [a, b] of [[maya, leo], [maya, sara], [leo, maya], [sara, maya], [sara, leo]] as const) follow(ctx, a.id, b.username);
for (const u of [maya, leo, sara]) follow(ctx, u.id, "northwind");

async function post(userId: number, caption: string, art: Parameters<typeof outfit>, tags: TagInput[]) {
  const img = await storeImage(ctx.config, await outfit(...art));
  return createPost(ctx, userId, [img], caption, tags);
}

const p1 = await post(maya.id, "Double denim, no regrets.", ["#f3e7d9", "#3b5b8c", "#2e4a74", "#f5f5f5", "bag"], [
  { image: 0, x: 0.5, y: 0.45, label: "Trucker jacket", category: "outerwear", brandSlug: northwind.slug, productId: trucker.id },
  { image: 0, x: 0.43, y: 0.75, label: "Straight jeans", category: "bottom", brandSlug: northwind.slug, productId: straight.id },
  { image: 0, x: 0.38, y: 0.9, label: "White sneakers", category: "shoes", brandSlug: kite.slug, productId: runner.id },
  { image: 0, x: 0.77, y: 0.6, label: "Leather tote", category: "bag", brandSlug: mare.slug, productId: tote.id },
]);
const p2 = await post(leo.id, "Linen season in Lisbon ☀️", ["#dfe9e4", "#d8c3a5", "#4a4a48", "#111111", "glasses"], [
  { image: 0, x: 0.5, y: 0.45, label: "Linen overshirt", category: "top", brandSlug: mare.slug, productId: linen.id },
  { image: 0, x: 0.5, y: 0.225, label: "Round sunglasses", category: "eyewear", brandName: "Lumen Optics", url: "https://lumen.example.com/round" },
  { image: 0, x: 0.6, y: 0.9, label: "Black court shoes", category: "shoes", brandSlug: kite.slug, productId: court.id },
]);
const p3 = await post(sara.id, "Sunday in colour.", ["#fde2e4", "#e76f51", "#264653", "#e9c46a", "hat"], [
  { image: 0, x: 0.5, y: 0.15, label: "Wool fedora", category: "hat", brandName: "Hatter & Co" },
  { image: 0, x: 0.5, y: 0.47, label: "Orange knit", category: "top", brandName: "Second-hand" },
  { image: 0, x: 0.5, y: 0.75, label: "Teal trousers", category: "bottom", brandSlug: northwind.slug },
]);
await post(northwind.user.id, "The Trucker, broken in over a year.", ["#e9eef5", "#3b5b8c", "#1f3556", "#7a4b2a", "hat"], [
  { image: 0, x: 0.5, y: 0.45, label: "Trucker jacket", category: "outerwear", brandSlug: northwind.slug, productId: trucker.id },
  { image: 0, x: 0.43, y: 0.75, label: "Straight jeans", category: "bottom", brandSlug: northwind.slug, productId: straight.id },
]);

// Brand review: Northwind confirms Maya's tags.
ctx.db.prepare("UPDATE tags SET status = 'CONFIRMED', reviewed_at = ? WHERE post_id = ? AND brand_id = (SELECT id FROM brands WHERE slug = ?)")
  .run(new Date().toISOString(), p1, northwind.slug);

for (const [u, postId] of [[leo, p1], [sara, p1], [maya, p2], [sara, p2], [maya, p3]] as const) setLike(ctx, u.id, postId, true);
addComment(ctx, leo.id, p1, "That jacket is perfect 🔥");
addComment(ctx, sara.id, p1, "Need that tote!");
addComment(ctx, maya.id, p2, "Linen king.");

console.log(`Seeded ${config.dbPath}. Log in as maya.styles, leo_fits, sara.wears, northwind (brand) or admin — password: ${PASSWORD}`);
