# Stylegram

A photo-sharing app where people post their outfits and **tag each piece of clothing and each accessory to
the actual brand and product**. Brands get a verified account, review the tags on their products, link them
to their catalog, and see how much shopping traffic the posts send them.

## Quick start

```bash
npm install
npm run seed     # optional: demo users, brands and tagged posts
npm run dev      # http://localhost:3002
npm test
```

The seed creates `maya.styles`, `leo_fits`, `sara.wears`, the brand account `northwind` and `admin`. Every
password is `password123`. The demo brands (Northwind Denim, Atelier Mare, Kite Footwear) are made up.

The demo posts use real photos from [Unsplash](https://unsplash.com), which are free to use under the
[Unsplash License](https://unsplash.com/license). `npm run seed` downloads them, so it needs an internet
connection. Any photo that can't be downloaded is replaced with a plain placeholder. Each post opens with an
untagged "full look" photo, followed by single-product shots tagged at the item. The photo list, with
Unsplash IDs and photographers, is in `src/seed.ts`.

## Look and feel

The layout is familiar to people who use social apps, with Stylegram's own visual identity:
- **Icons:** a custom set of soft, rounded, lightly tinted icons. Home is stacked look cards, Explore is a
  sparkle, Create is a gradient **+** button, Saved is a **hanger** ("Closet"), and product tags use a
  **price tag**.
- **Brand colours:** an indigo-to-teal gradient for avatar rings, the verified badge, primary buttons and the
  app icon.
- **Navigation:** a left sidebar on desktop (icons only on tablets), and a bottom tab bar plus top bar on
  phones.
- **Feed and posts:** a row of people you follow, suggestions, swipeable carousels, and double-tap to like
  with a rose heart and a ring animation. Product tags appear when you tap the photo, and a "Shop the look"
  strip opens a product sheet.
- **Everything else:** profile and brand grids, Explore with search and categories, a two-column post page
  on desktop, a "Create new post" flow with tap-to-tag, light and dark mode, and @mentions and #hashtags as
  links.

## AI photo checks and item suggestions

Every uploaded photo (posts, profile photos, brand logos) is reviewed by Claude's vision model **before
anything is stored**. Each photo is reviewed in one call, which returns:
- **A safety verdict.** Partial nudity, explicit nudity, sexual activity, and any sexualised depiction of
  someone who may be a minor are **blocked** ("This photo can't be posted…"). Swimwear and underwear worn in
  an ordinary way are allowed, as you'd expect for a fashion app. If the AI can't be reached, the upload is
  refused rather than let through, and if the model declines to review a photo, it's treated as unsafe.
  Blocked attempts (who, when, why; never the image) appear under **Admin → Blocked uploads**.
- **Item suggestions.** The clothes and accessories visible, with their approximate position and a brand
  when a logo is legible. In **Create**, suggested items show as ✦ markers on the photo and as a list beside
  it. Tapping one opens the tag form pre-filled, matched to a known brand and its catalog product when
  possible.

Results are cached per photo, so a photo is only checked once, even though it's checked again when you share.
To set it up, add **`ANTHROPIC_API_KEY`** (from console.anthropic.com) to your Railway variables. Without it,
uploads are **not** checked and the server logs a warning.

- **Model:** `claude-opus-5-5` at low effort, with automatic server-side fallback if a request is declined.
  Change it with `AI_MODEL`.
- **Cost:** photos are shrunk to 1024 px first. Expect roughly **1–2 US cents per photo**.
- **Spending cap:** `AI_ANALYSES_PER_HOUR` (default 60) limits suggestion requests per user.

## Commissions

Stylegram earns a commission when someone buys through a Shop link, and shares it with the creator who
tagged the item.

1. **Brands** turn on a program in **Brand dashboard → Commissions**. They set a commission % (up to 50%)
   and an attribution window (1–90 days), and create an API key.
2. **Every Shop click** gets a unique `sg_click` id added to the product URL. The brand's site keeps it, for
   example in a cookie, until checkout.
3. **The brand's server reports the order:**
   ```bash
   curl -X POST https://<your-app>/api/v1/conversions \
     -H "Authorization: Bearer sgk_..." -H "Content-Type: application/json" \
     -d '{"clickId":"sgc_...","orderId":"1001","amount":"89.90","currency":"USD"}'
   ```
   Refunds go to `POST /api/v1/conversions/<orderId>/reverse`. Reports are idempotent per order id, so
   sending one twice is harmless.
4. **Stylegram attributes and splits the sale.** The sale is attributed to the tagged post if the click was
   within the window. Commission = order amount × the brand's rate. The creator gets `CREATOR_SHARE_PERCENT`
   (default 50%) and the rest is the platform's. Sales on a brand's own posts earn nothing.
5. **Commissions are approved after the refund window.** Each one stays **pending** for
   `COMMISSION_APPROVAL_DAYS` (default 30), then it's **approved**, unless it was reversed first.

Creators see their sales under **Earnings** (More menu). When a tag can earn a commission, shoppers see a
disclosure on the product sheet: "Stylegram and @creator may earn a commission if you buy…".

**Brands without a Stylegram program:** set `AFFILIATE_LINK_TEMPLATE` to route their Shop links through an
affiliate network such as Skimlinks, Sovrn or Awin. `{url}` is replaced with the product URL and `{click}`
with the click id, which you pass as the network's sub-id so its reports can be matched to creators. Use the
exact link format from your network's dashboard, for example
`https://go.skimresources.com/?id=YOUR_ID&xs=1&url={url}&xcust={click}`.

**Not built yet:**
- **Paying people out.** Brands are invoiced, and approved earnings are paid out manually. Automating this
  would mean, for example, Stripe Connect payouts to creators plus tax forms.
- **Importing affiliate-network reports.** Network sales currently show up only in the network's own
  dashboard.

## Deploy to Railway

The repo is ready for [Railway](https://railway.com): `railway.json` tells it to build the `Dockerfile` and
check `/api/health`. Expect about **$5/month** on the Hobby plan.

1. **Create the project.** Sign in at railway.com with GitHub, pick the **Hobby** plan, then
   **New Project → Deploy from GitHub repo → `stylegram`**. If the repo isn't listed, let Railway's GitHub
   app access it.
2. **Add a volume.** This is where the database and photos live; without it, everything is lost on each
   deploy. On the project canvas, right-click the service → **Attach volume**, and set the mount path to
   **`/data`**. The app finds it automatically through `RAILWAY_VOLUME_MOUNT_PATH`.
3. **Set variables.** In the service's **Variables** tab:

   | Variable | Value |
   | --- | --- |
   | `ADMIN_USERNAME` | your admin username, e.g. `fardeen` |
   | `ADMIN_PASSWORD` | a long password (12+ characters) |
   | `SEED_DEMO` | `true` to fill the site with the demo posts on first start (optional) |
   | `DEMO_PASSWORD` | password for the demo accounts (optional; otherwise one is generated and printed in the deploy logs) |
   | `ANTHROPIC_API_KEY` | **needed for the nudity check** and AI suggestions (from console.anthropic.com) |

   `JWT_SECRET` is optional. If it isn't set, a secret is generated once and kept on the volume.
4. **Get a link.** Go to **Settings → Networking → Generate Domain**, which gives you
   `https://<name>.up.railway.app`. If it asks for a port, use the one in the deploy logs
   ("listening on port …").
5. **Open it on your phone** and tap **Install** (Android) or **Add** (iPhone). It's https, so installing
   works.

**Notes**
- Keep the service at **1 replica**. The SQLite database lives on the single volume.
- Redeploys keep all data (it's on the volume). A service with a volume has a few seconds of downtime while
  it switches over.
- Railway also offers volume backups. Turn them on once real people use the site.
- To use your own domain, go to **Settings → Networking → Custom Domain** and add the DNS record it shows.

## Install it on your phone (app version)

Stylegram is an installable web app (a PWA). Once added to your home screen, it gets its own icon, opens
full-screen without browser bars, has a splash screen, and shows the feed and photos you've already seen
even when you're offline.

- **Android (Chrome):** open the app and tap **Install** in the banner, or use ⋮ → **Install app**.
- **iPhone (Safari):** tap **Add** in the banner and follow the steps, or tap Share → **Add to Home Screen**.
- **Desktop (Chrome / Edge):** click **Install app** in the sidebar, or the install icon in the address bar.

Phones only allow full installing from a **secure (https) address**. `http://localhost` counts as secure,
but your computer's Wi-Fi address (`http://192.168.x.x:3002`) doesn't. The easiest ways to get https on
your phone:
- Run it in **GitHub Codespaces**. In the **Ports** tab, set port 3002 to **Public** and open that https
  link on your phone.
- Or put it online, for example on Render, Railway or Fly.io.

On the Wi-Fi address you can still browse the mobile version; you just won't get the install button.

The service worker (`public/sw.js`):
- Always loads fresh data when online.
- Remembers recent API responses and photos for offline use.
- Never stores login, admin or brand-dashboard requests.
- Its saved data is deleted whenever someone logs in or out, so another person on the same phone can't see it.

## How it works

**For people**
- Post up to 10 photos per post (a carousel), with a caption.
- Tap a photo to drop a tag on an item. Choose the brand (autocomplete), then either pick the exact product
  from that brand's catalog or describe the item and paste a link. Each tag also gets a category such as top,
  shoes, bag or eyewear.
- A post shows dots on each tagged item and a list of "items in this photo" with a **Shop** button.
- Feed (people you follow), Explore (filter by category, search brands, items and captions), profiles,
  follows, likes, comments and saved posts.

**For brands**
- **Every brand gets a page, even before it signs up.** When someone tags a brand nobody has tagged before,
  a *community brand* page is created. It lists every post that tags the brand ("Seen on").
- **Brand accounts:** a business signs up as a brand. If the brand is new, an admin verifies it. If a
  community page already exists for it, the business files a **claim**, and approving the claim hands the
  page and all its existing tags to that business. Brands can't manage anything until they're verified, so
  nobody can take over "Nike" by signing up first.
- **Catalog:** verified brands add products (name, link, price, category). People can then tag the exact
  product.
- **Tag review:** brands **confirm** tags, which adds a "Brand confirmed" badge and can correct the tag to the
  right catalog product, or **reject** them ("not ours"). Rejected tags disappear for everyone except the
  post's author, and their Shop link stops working. When a verified brand tags its own posts, the tags are
  confirmed automatically.
- **Analytics:** totals for tags, posts and creators, shop clicks over the last 7 and 30 days, and the top
  products by tags and clicks.

**Shop links** go through `/t/:tagId`. The app counts the click, then redirects to the catalog product's
link, or the link the tagger added, or the brand's website, in that order. It adds `utm_source=stylegram`
and `utm_campaign=post_<id>` so the brand can see the traffic in its own analytics.

## Safety and privacy built in

- **Uploads are decoded and re-encoded** with `sharp`. This removes EXIF metadata, including **GPS
  location**, from every photo. Anything that isn't a real image is rejected. Files are capped at 10 MB and
  50 megapixels.
- Outbound links must be `http(s)` URLs, so a `javascript:` or `data:` link is rejected. The redirect only
  ever goes to a stored, validated URL, so it can't be used to send people to arbitrary sites.
- Passwords are hashed with scrypt, and the web client escapes everything that users write.

## API overview

All JSON endpoints are under `/api`. Send `Authorization: Bearer <token>` where a route needs a login.

| Area | Endpoints |
| --- | --- |
| Auth | `POST /auth/register` (`accountType: PERSONAL\|BRAND`, `brand: {name, website}`), `POST /auth/login` |
| Me | `GET/PATCH /me`, `PUT /me/avatar` (multipart `avatar`), `GET /me/saved` |
| Users | `GET /users?q=`, `GET /users/:u`, `GET /users/:u/posts`, `PUT/DELETE /users/:u/follow` |
| Posts | `POST /posts` (multipart: `images[]`, `caption`, `tags` as a JSON array), `GET/PATCH/DELETE /posts/:id`, `GET /feed`, `GET /explore?category=&q=` |
| Tags | `POST /posts/:id/tags`, `DELETE /tags/:id`, `GET /t/:id` (outbound redirect) |
| Engagement | `PUT/DELETE /posts/:id/like`, `PUT/DELETE /posts/:id/save`, `GET/POST /posts/:id/comments`, `DELETE /comments/:id` |
| Brands | `GET /brands?q=`, `GET /brands/:slug`, `GET /brands/:slug/products`, `GET /brands/:slug/posts?product=` |
| Brand admin | `GET /brand/dashboard`, `PATCH /brand`, `PUT /brand/logo`, `GET/POST /brand/products`, `PATCH/DELETE /brand/products/:id`, `GET /brand/tags?status=`, `POST /brand/tags/:id/review` |
| Site admin | `GET /admin/queue`, `POST /admin/brands/:slug/verify`, `POST /admin/claims/:id` |

A tag in `POST /posts` looks like this:

```json
{ "image": 0, "x": 0.42, "y": 0.35, "label": "Denim jacket", "category": "outerwear",
  "brandSlug": "northwind-denim", "productId": 12 }
```

To tag a brand by name instead, use `"brandName": "Some Brand"`. The brand is found, or created as a
community brand. You can also add an optional `"url"`. `x` and `y` are fractions of the photo's width and
height.

## Configuration

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `3002` | Railway sets this automatically |
| `DATA_DIR` | Railway volume path, else `.` | Folder for the database, photos and generated secret |
| `DB_PATH` | `<DATA_DIR>/stylegram.db` | SQLite file |
| `UPLOAD_DIR` | `<DATA_DIR>/uploads` | Processed images, served at `/media/` |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | none | Production admin account, created at startup |
| `SEED_DEMO`, `DEMO_PASSWORD` | off | Demo content on an empty database at first start |
| `JWT_SECRET` | generated once and kept in `<DATA_DIR>/.jwt-secret` | Set it yourself if you prefer; tokens stay valid across restarts either way |
| `ADMIN_USERNAMES` | `admin` | **Development only**: these usernames become admins when they register |
| `UTM_SOURCE` | `stylegram` | |
| `ANTHROPIC_API_KEY` | none | Turns on photo safety checks and item suggestions |
| `AI_MODEL` | `claude-opus-5-5` | Vision model |
| `AI_ANALYSES_PER_HOUR` | `60` | Suggestion requests per user per hour |
| `CREATOR_SHARE_PERCENT` | `50` | Creator's share of each commission |
| `COMMISSION_APPROVAL_DAYS` | `30` | Refund window before a commission is approved |
| `AFFILIATE_LINK_TEMPLATE` | none | Affiliate-network link for brands without a program |

## Stack

Node.js + TypeScript, Express 5, SQLite (better-sqlite3), sharp for images, zod for validation, and a
dependency-free vanilla JS front end. Tests use Vitest + supertest with real image fixtures.

## Before going to production

- Move image storage to object storage with a CDN, and processing to a background queue.
- Add email verification, rate limits, content moderation (reporting, plus automated nudity and violence
  checks), blocking, and private accounts.
- Verify brands properly, for example by sending a code to an email at the brand's domain or checking a DNS
  TXT record, instead of relying on manual admin review alone.
- Affiliate programmes (such as Rakuten, Awin or brands' own) and catalog import from product feeds (Google
  Merchant or Shopify) would let creators earn from their tags, and would save brands from adding products
  by hand.
- Native mobile apps, and an AI model that suggests what each item is.
