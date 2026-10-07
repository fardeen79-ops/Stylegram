import Database from "better-sqlite3";

export type DB = Database.Database;

export const CATEGORIES = [
  "top",
  "bottom",
  "dress",
  "abaya",
  "kandura",
  "outerwear",
  "shoes",
  "bag",
  "scarf",
  "hat",
  "eyewear",
  "jewelry",
  "watch",
  "accessory",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  bio           TEXT NOT NULL DEFAULT '',
  avatar_path   TEXT,
  account_type  TEXT NOT NULL CHECK (account_type IN ('PERSONAL','BRAND')),
  is_admin      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id != followee_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_followee ON follows(followee_id);

-- Brands exist independently of accounts: users can tag a brand that has never signed up
-- ("community" brand). A business account later claims it and an admin verifies the claim.
CREATE TABLE IF NOT EXISTS brands (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  website     TEXT,
  logo_path   TEXT,
  description TEXT NOT NULL DEFAULT '',
  verified    INTEGER NOT NULL DEFAULT 0,
  owner_id    INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS brand_claims (
  id          INTEGER PRIMARY KEY,
  brand_id    INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  created_at  TEXT NOT NULL,
  decided_at  TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY,
  brand_id    INTEGER NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  price_cents INTEGER CHECK (price_cents IS NULL OR price_cents >= 0),
  currency    TEXT NOT NULL DEFAULT 'USD',
  category    TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id, active);

CREATE TABLE IF NOT EXISTS posts (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption    TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);

CREATE TABLE IF NOT EXISTS post_images (
  id         INTEGER PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  path       TEXT NOT NULL,
  thumb_path TEXT NOT NULL,
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  UNIQUE (post_id, position)
);

-- A tag pins an item at (x, y) on an image (fractions 0..1 of width/height) to a brand,
-- optionally a specific catalog product, or a free-form product link.
CREATE TABLE IF NOT EXISTS tags (
  id          INTEGER PRIMARY KEY,
  post_id     INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  image_id    INTEGER NOT NULL REFERENCES post_images(id) ON DELETE CASCADE,
  x           REAL NOT NULL CHECK (x >= 0 AND x <= 1),
  y           REAL NOT NULL CHECK (y >= 0 AND y <= 1),
  brand_id    INTEGER NOT NULL REFERENCES brands(id),
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  label       TEXT NOT NULL,
  category    TEXT NOT NULL,
  url         TEXT,
  status      TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','CONFIRMED','REJECTED')),
  reviewed_at TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tags_post ON tags(post_id);
CREATE INDEX IF NOT EXISTS idx_tags_brand ON tags(brand_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_tags_product ON tags(product_id);

CREATE TABLE IF NOT EXISTS tag_clicks (
  id         INTEGER PRIMARY KEY,
  tag_id     INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clicks_tag ON tag_clicks(tag_id, created_at);

CREATE TABLE IF NOT EXISTS likes (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_post ON likes(post_id);

CREATE TABLE IF NOT EXISTS saves (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY,
  post_id    INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
`;

/**
 * Schema changes after the first release, applied in order and tracked with SQLite's
 * `user_version`, so existing databases (e.g. on a Railway volume) upgrade in place.
 * Never edit a migration that has shipped; add a new one.
 */
const MIGRATIONS: string[] = [
  // 1: commissions (brand programs, click ids, conversions) and AI image checks.
  `
  ALTER TABLE brands ADD COLUMN commission_bps INTEGER CHECK (commission_bps IS NULL OR commission_bps BETWEEN 0 AND 10000);
  ALTER TABLE brands ADD COLUMN attribution_days INTEGER NOT NULL DEFAULT 30;
  ALTER TABLE brands ADD COLUMN api_key_hash TEXT;
  ALTER TABLE brands ADD COLUMN api_key_prefix TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_api_key ON brands(api_key_hash);

  ALTER TABLE tag_clicks ADD COLUMN click_id TEXT;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_clicks_click_id ON tag_clicks(click_id);

  -- A purchase a brand reports for a Stylegram click (server-to-server conversion API).
  CREATE TABLE conversions (
    id               INTEGER PRIMARY KEY,
    brand_id         INTEGER NOT NULL REFERENCES brands(id),
    click_id         TEXT NOT NULL,
    tag_id           INTEGER REFERENCES tags(id) ON DELETE SET NULL,
    post_id          INTEGER REFERENCES posts(id) ON DELETE SET NULL,
    creator_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
    order_id         TEXT NOT NULL,
    amount_cents     INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency         TEXT NOT NULL,
    commission_bps   INTEGER NOT NULL,
    commission_cents INTEGER NOT NULL,
    creator_cents    INTEGER NOT NULL,
    reversed_at      TEXT,
    created_at       TEXT NOT NULL,
    UNIQUE (brand_id, order_id)
  );
  CREATE INDEX idx_conversions_creator ON conversions(creator_id, created_at);
  CREATE INDEX idx_conversions_brand ON conversions(brand_id, created_at);

  -- AI results per uploaded file (sha256 of the original bytes), so a photo is checked once.
  CREATE TABLE image_analyses (
    hash          TEXT PRIMARY KEY,
    verdict       TEXT NOT NULL,
    minor_concern INTEGER NOT NULL,
    reason        TEXT NOT NULL,
    items         TEXT NOT NULL,
    model         TEXT NOT NULL,
    created_at    TEXT NOT NULL
  );

  -- Blocked upload attempts (the image itself is never stored), for admin review.
  CREATE TABLE moderation_events (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    hash       TEXT NOT NULL,
    verdict    TEXT NOT NULL,
    reason     TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  `,
  // 2: UAE launch: trade licence numbers for brand verification and claims.
  `
  ALTER TABLE brands ADD COLUMN trade_licence TEXT;
  ALTER TABLE brand_claims ADD COLUMN trade_licence TEXT;
  `,
];

export function migrate(db: DB): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]!);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

export function openDb(path: string): DB {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** The original schema, for migration tests. */
export const BASE_SCHEMA = SCHEMA;
