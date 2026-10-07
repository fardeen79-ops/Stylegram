/**
 * Demo content for the UAE launch: four verified (fictional) UAE brands with AED catalogs, a few creators, follows,
 * likes, comments and tagged outfit posts using free Unsplash photos downloaded at seed time.
 * Used by `npm run seed` locally and by SEED_DEMO=true on a fresh production deploy.
 */
import sharp from "sharp";
import type { Ctx } from "./context.js";
import { storeImage } from "./media.js";
import { createProduct } from "./services/brands.js";
import { addComment, createPost, setLike, type TagInput } from "./services/posts.js";
import { follow, registerUser, updateProfile } from "./services/users.js";

export const DEMO_USERNAMES = ["noor.styles", "omar.fits", "priya.wears", "creekdenim", "dunefootwear", "alseefleather", "saffronsand"];

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
  abaya: { id: "MzImhIYa3-I", alt: "Black abaya with floral embellishments and lace cuffs", by: "Abdul Raheem Kannath" },
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

/**
 * Unsplash's download link redirects to the original file (often 20-50+ megapixels). Ask its
 * image CDN for a 1600px version instead, which keeps memory low on small servers.
 */
async function downloadUrl(id: string): Promise<string> {
  const page = `https://unsplash.com/photos/${id}/download?force=true`;
  try {
    const res = await fetch(page, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const location = res.headers.get("location");
    if (!location) return page;
    const url = new URL(location, page);
    if (url.hostname === "images.unsplash.com") {
      url.searchParams.set("w", "1600");
      url.searchParams.set("q", "85");
      url.searchParams.set("fm", "jpg");
    }
    return url.toString();
  } catch {
    return page;
  }
}

async function photo(key: PhotoKey): Promise<Buffer> {
  const p = PHOTOS[key];
  try {
    const res = await fetch(await downloadUrl(p.id), { signal: AbortSignal.timeout(30_000) });
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
  const person = (username: string, displayName: string, bio: string, language: "en" | "ar" = "en") => {
    const { user } = registerUser(ctx, { username, email: `${username}@example.com`, password: PASSWORD, displayName, accountType: "PERSONAL", language });
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


  const creek = brandAccount("creekdenim", "Creek Denim", "https://creekdenim.example", "Denim cut and finished in Dubai.");
  const dune = brandAccount("dunefootwear", "Dune Footwear", "https://dunefootwear.example", "Everyday sneakers and sandals made for UAE summers.");
  const alseef = brandAccount("alseefleather", "Al Seef Leather", "https://alseef.example", "Leather bags and small goods, designed in Sharjah.");
  const saffron = brandAccount("saffronsand", "Saffron & Sand", "https://saffronsand.example", "Abayas, kaftans and shaylas for every occasion.");
  // Brands running a Stylegram commission program (so Shop links show the commission disclosure).
  ctx.db.prepare("UPDATE brands SET commission_bps = 1000 WHERE slug IN (?, ?)").run(creek.slug, alseef.slug);
  ctx.db.prepare("UPDATE brands SET commission_bps = 1200 WHERE slug = ?").run(saffron.slug);

  // All prices in AED (whole dirhams).
  const p = (owner: number, name: string, url: string, aed: number, category: Parameters<typeof createProduct>[2]["category"]) =>
    createProduct(ctx, owner, { name, url, priceCents: aed * 100, currency: "AED", category });
  const straight = p(creek.user.id, "Straight Jean – Rinse", "https://creekdenim.example/straight", 349, "bottom");
  p(creek.user.id, "Trucker Jacket – Indigo", "https://creekdenim.example/trucker", 459, "outerwear");
  p(creek.user.id, "Denim Shirt", "https://creekdenim.example/shirt", 299, "top");
  const runner = p(dune.user.id, "Dune Runner – White", "https://dunefootwear.example/runner", 449, "shoes");
  p(dune.user.id, "Court Low – Black", "https://dunefootwear.example/court-low", 399, "shoes");
  p(dune.user.id, "Desert Slide – Sand", "https://dunefootwear.example/slide", 199, "shoes");
  const tote = p(alseef.user.id, "Market Tote – Tan", "https://alseef.example/market-tote", 790, "bag");
  const bag = p(alseef.user.id, "Weekender – Chestnut", "https://alseef.example/weekender", 1150, "bag");
  p(alseef.user.id, "Card Holder", "https://alseef.example/card-holder", 180, "accessory");
  const abaya = p(saffron.user.id, "Midnight Crepe Abaya", "https://saffronsand.example/midnight-abaya", 650, "abaya");
  p(saffron.user.id, "Linen Shayla – Sand", "https://saffronsand.example/linen-shayla", 120, "scarf");
  p(saffron.user.id, "Kaftan Dress – Rose", "https://saffronsand.example/kaftan-rose", 480, "dress");

  const noor = person("noor.styles", "Noor Al Hashimi", "دبي · أزياء محتشمة وجولات في السوق نهاية الأسبوع", "ar");
  const omar = person("omar.fits", "Omar Haddad", "Abu Dhabi · menswear, kept minimal");
  const priya = person("priya.wears", "Priya Menon", "Sharjah · colour, always");

  for (const [a, b] of [[noor, omar], [noor, priya], [omar, noor], [priya, noor], [priya, omar]] as const) follow(ctx, a.id, b.username);
  for (const u of [noor, omar, priya]) {
    follow(ctx, u.id, "creekdenim");
    follow(ctx, u.id, "saffronsand");
  }

  /** A tag at the centre of a single-item product shot. */
  const centre = (image: number, t: Omit<TagInput, "image" | "x" | "y">): TagInput => ({ image, x: 0.5, y: 0.5, ...t });

  async function post(userId: number, caption: string, photos: PhotoKey[], tags: TagInput[]) {
    const images = [];
    for (const key of photos) images.push(await storeImage(ctx.config, await photo(key)));
    return createPost(ctx, userId, images, caption, tags);
  }

  log.log("Downloading demo photos from Unsplash…");
  const p1 = await post(noor.id, "Denim on denim for a cool Dubai evening 🌙 Swipe for the pieces 👉 #dubaifashion", ["denimLook", "jeansHanger", "whiteSneakers", "brownBag"], [
    centre(1, { label: "Straight jeans", category: "bottom", brandSlug: creek.slug, productId: straight.id }),
    centre(2, { label: "White sneakers", category: "shoes", brandSlug: dune.slug, productId: runner.id }),
    centre(3, { label: "Leather tote", category: "bag", brandSlug: alseef.slug, productId: tote.id }),
  ]);
  const p2 = await post(omar.id, "Weekend on Saadiyat ☀️ #abudhabi", ["shirtFlatlay", "sunglasses", "whiteTee"], [
    centre(1, { label: "Round sunglasses", category: "eyewear", brandName: "Marina Optics", url: "https://marinaoptics.example/round" }),
    centre(2, { label: "Heavyweight white tee", category: "top", brandName: "Jumeirah Basics" }),
  ]);
  const p3 = await post(priya.id, "Packed for a staycation in Hatta 🏔️", ["accessoriesFlatlay", "brownBag2"], [
    centre(1, { label: "Leather weekender", category: "bag", brandSlug: alseef.slug, productId: bag.id }),
  ]);
  await post(creek.user.id, "Restock day: the Straight Jean is back in every wash. Free delivery across the UAE.", ["jeansRack"], [
    centre(0, { label: "Straight jeans", category: "bottom", brandSlug: creek.slug, productId: straight.id }),
  ]);
  await post(omar.id, "All black for Alserkal Avenue.", ["blackFlatlay"], []);
  await post(priya.id, "Souk run in Deira with my favourite tote", ["toteInHand"], [
    centre(0, { label: "Market tote", category: "bag", brandSlug: alseef.slug, productId: tote.id }),
  ]);
  const p7 = await post(noor.id, "إطلالة العيد ✨ عباية الكريب الليلية من @saffronsand تفاصيل الأكمام رائعة #موضة_محتشمة #uae", ["abaya"], [
    centre(0, { label: "Black abaya", category: "abaya", brandSlug: saffron.slug, productId: abaya.id }),
  ]);
  await post(noor.id, "Desert drive essentials 🌵 #uae", ["outdoorFlatlay"], []);

  // Brand review: Creek Denim and Saffron & Sand confirm Noor's tags.
  ctx.db
    .prepare("UPDATE tags SET status = 'CONFIRMED', reviewed_at = ? WHERE post_id IN (?, ?) AND brand_id IN (SELECT id FROM brands WHERE slug IN (?, ?))")
    .run(new Date().toISOString(), p1, p7, creek.slug, saffron.slug);

  for (const [u, postId] of [[omar, p1], [priya, p1], [noor, p2], [priya, p2], [noor, p3], [priya, p7], [omar, p7]] as const) {
    setLike(ctx, u.id, postId, true);
  }
  addComment(ctx, omar.id, p1, "Those jeans are perfect 🔥");
  addComment(ctx, priya.id, p1, "Need that tote!");
  addComment(ctx, noor.id, p2, "Saadiyat sunsets never miss.");
  addComment(ctx, priya.id, p7, "Love this abaya 😍 the detail on the cuffs!");
  addComment(ctx, omar.id, p7, "ما شاء الله، اختيار رائع 👌");
  addComment(ctx, noor.id, p1, "شكرًا! الجينز من @creekdenim");

  if (fallbacks) log.warn(`${fallbacks} photo(s) couldn't be downloaded and were replaced with placeholders.`);
}
