/**
 * Demo content: three verified (fictional) brands with catalogs, a few creators, follows,
 * likes, comments and tagged outfit posts using free Unsplash photos downloaded at seed time.
 * Used by `npm run seed` locally and by SEED_DEMO=true on a fresh production deploy.
 */
import sharp from "sharp";
import type { Ctx } from "./context.js";
import { storeImage } from "./media.js";
import { createProduct } from "./services/brands.js";
import { addComment, createPost, setLike, type TagInput } from "./services/posts.js";
import { follow, registerUser, updateProfile } from "./services/users.js";

export const DEMO_USERNAMES = ["maya.styles", "leo_fits", "sara.wears", "northwind", "ateliermare", "kitefootwear"];

/**
 * Demo photos from Unsplash (free to use under the Unsplash License, https://unsplash.com/license).
 * They're downloaded when you seed, not stored in the repo. Product shots have their item roughly
 * centred, so their tags sit at the centre; "look" photos open each carousel untagged.
 */
const PHOTOS = {
  denimLook: { id: "ItqFmSxKnIg", alt: "Blue denim jeans and brown leather shoes" },
  jeansHanger: { id: "EtOMMg1nSR8", alt: "Blue denim jeans on a clothes hanger", by: "Jason Leung" },
  jeansRack: { id: "GbveIG8YKMk", alt: "Jeans hanging on a rail", by: "Waldemar Brandt" },
  whiteSneakers: { id: "SQHcsZplFHI", alt: "Pair of white low-top sneakers" },
  brownBag: { id: "tcVH_BwHtrc", alt: "Brown leather handbag on a white surface", by: "Irene Kredenets" },
  brownBag2: { id: "pSVYyO-XlJk", alt: "Brown leather bag", by: "Irene Kredenets" },
  sunglasses: { id: "llMiSJhJHBA", alt: "Sunglasses on a table", by: "Marios Gkortsilas" },
  whiteTee: { id: "elbKS4DY21g", alt: "White crew-neck t-shirt" },
  shirtFlatlay: { id: "YL7Y9uZ5O98", alt: "Button-up shirt, camera and leather boat shoes" },
  blackFlatlay: { id: "RsJDUzKdBws", alt: "Folded black shirt, watch and sneakers" },
  accessoriesFlatlay: { id: "QbNpxO0G27c", alt: "Men's accessories and clothing on green" },
  outdoorFlatlay: { id: "h-wQrAU5yhw", alt: "Outdoor clothing and accessories flat lay" },
  toteInHand: { id: "2_tjJJqsZms", alt: "Person holding a brown leather tote bag" },
} as const;
type PhotoKey = keyof typeof PHOTOS;

const FALLBACK_COLORS = ["#e9e4dc", "#dfe9e4", "#fde2e4", "#e3e8f3", "#f3ead7", "#e6e1f0"];
let fallbacks = 0;

/** Plain placeholder used when a photo can't be downloaded (e.g. offline). */
async function placeholder(label: string): Promise<Buffer> {
  const bg = FALLBACK_COLORS[fallbacks++ % FALLBACK_COLORS.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <rect width="1080" height="1350" fill="${bg}"/>
    <text x="540" y="675" font-family="sans-serif" font-size="44" fill="#555" text-anchor="middle">${label.replace(/[<&>]/g, "")}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

async function photo(key: PhotoKey): Promise<Buffer> {
  const p = PHOTOS[key];
  try {
    const res = await fetch(`https://unsplash.com/photos/${p.id}/download?force=true`, {
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Originals can be very large: shrink before the normal upload pipeline.
    return await sharp(Buffer.from(await res.arrayBuffer()), { limitInputPixels: false })
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch (err) {
    console.warn(`  ! couldn't download photo ${p.id} (${(err as Error).message}); using a placeholder`);
    return placeholder(p.alt);
  }
}

export async function seedDemo(ctx: Ctx, opts: { password: string; log?: Pick<Console, "log" | "warn"> }): Promise<void> {
  const log = opts.log ?? console;
  fallbacks = 0;
  const PASSWORD = opts.password;
  const person = (username: string, displayName: string, bio: string) => {
    const { user } = registerUser(ctx, { username, email: `${username}@example.com`, password: PASSWORD, displayName, accountType: "PERSONAL" });
    updateProfile(ctx, user.id, { bio });
    return user;
  };
  const brandAccount = (username: string, name: string, website: string, description: string) => {
    const { user, brand } = registerUser(ctx, {
      username, email: `${username}@example.com`, password: PASSWORD, displayName: name, accountType: "BRAND", brand: { name, website },
    });
    ctx.db.prepare("UPDATE brands SET verified = 1, description = ? WHERE slug = ?").run(description, brand!.slug);
    return { user, slug: brand!.slug };
  };


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

  /** A tag at the centre of a single-item product shot. */
  const centre = (image: number, t: Omit<TagInput, "image" | "x" | "y">): TagInput => ({ image, x: 0.5, y: 0.5, ...t });

  async function post(userId: number, caption: string, photos: PhotoKey[], tags: TagInput[]) {
    const images = [];
    for (const key of photos) images.push(await storeImage(ctx.config, await photo(key)));
    return createPost(ctx, userId, images, caption, tags);
  }

  log.log("Downloading demo photos from Unsplash…");
  const p1 = await post(maya.id, "Double denim, no regrets. Swipe for the pieces 👉", ["denimLook", "jeansHanger", "whiteSneakers", "brownBag"], [
    centre(1, { label: "Straight jeans", category: "bottom", brandSlug: northwind.slug, productId: straight.id }),
    centre(2, { label: "White sneakers", category: "shoes", brandSlug: kite.slug, productId: runner.id }),
    centre(3, { label: "Leather tote", category: "bag", brandSlug: mare.slug, productId: tote.id }),
  ]);
  const p2 = await post(leo.id, "Linen season in Lisbon ☀️ #summer", ["shirtFlatlay", "sunglasses", "whiteTee"], [
    centre(1, { label: "Round sunglasses", category: "eyewear", brandName: "Lumen Optics", url: "https://lumen.example.com/round" }),
    centre(2, { label: "Heavyweight white tee", category: "top", brandName: "Common Thread" }),
  ]);
  const p3 = await post(sara.id, "Packed for the weekend.", ["accessoriesFlatlay", "brownBag2"], [
    centre(1, { label: "Brown leather bag", category: "bag", brandSlug: mare.slug }),
  ]);
  await post(northwind.user.id, "Restock day: the Straight Jean is back in every wash.", ["jeansRack"], [
    centre(0, { label: "Straight jeans", category: "bottom", brandSlug: northwind.slug, productId: straight.id }),
  ]);
  await post(leo.id, "All black everything.", ["blackFlatlay"], []);
  await post(sara.id, "Errands with my favourite tote", ["toteInHand"], [
    centre(0, { label: "Market tote", category: "bag", brandSlug: mare.slug, productId: tote.id }),
  ]);
  await post(maya.id, "Trail day essentials 🌲 #outdoors", ["outdoorFlatlay"], []);
  void trucker; void linen; void court;

  // Brand review: Northwind confirms Maya's tags.
  ctx.db.prepare("UPDATE tags SET status = 'CONFIRMED', reviewed_at = ? WHERE post_id = ? AND brand_id = (SELECT id FROM brands WHERE slug = ?)")
    .run(new Date().toISOString(), p1, northwind.slug);

  for (const [u, postId] of [[leo, p1], [sara, p1], [maya, p2], [sara, p2], [maya, p3]] as const) setLike(ctx, u.id, postId, true);
  addComment(ctx, leo.id, p1, "Those jeans are perfect 🔥");
  addComment(ctx, sara.id, p1, "Need that tote!");
  addComment(ctx, maya.id, p2, "Linen king.");

  if (fallbacks) log.warn(`${fallbacks} photo(s) couldn't be downloaded and were replaced with placeholders.`);
}
