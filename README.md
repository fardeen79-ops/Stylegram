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

The web app follows the familiar Instagram layout, with its own name, logo and icons:
- **Navigation:** a left sidebar on desktop, which shrinks to icons only on tablets, and a bottom tab bar plus
  top bar on phones.
- **Feed:** a row of people you follow with gradient rings, and a "Suggested for you" column.
- **Posts:** swipeable carousels with dots, and double-tap to like with a heart burst. Product tags appear when
  you tap the photo, and a "Shop the look" strip under each post opens a product sheet.
- **Profiles and brand pages:** a 3-column grid with like and comment counts on hover. Explore uses a mixed
  grid with large tiles, plus search and category chips.
- **Post page and Create:** on desktop, the post page shows the photo next to its comments. Create is a
  "Create new post" flow with drag-and-drop and tap-to-tag.
- **Everything else:** bottom-sheet menus, light and dark mode, and @mentions and #hashtags as links.

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
| `JWT_SECRET` | generated and kept in `.jwt-secret` (development) | **Required** when `NODE_ENV=production` |
| `ADMIN_USERNAMES` | `admin` | **Development only**: these usernames become admins when they register |
| `UTM_SOURCE` | `stylegram` | |

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
