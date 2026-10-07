import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import request from "supertest";
import { createApp } from "../src/app.js";
import { config } from "../src/config.js";
import type { Ctx } from "../src/context.js";
import { openDb } from "../src/db.js";

export async function jpeg(color = "#c33", width = 800, height = 1000, exif = false): Promise<Buffer> {
  let img = sharp({ create: { width, height, channels: 3, background: color } }).jpeg();
  if (exif) img = img.withMetadata({ exif: { IFD0: { Make: "TestCam" }, IFD3: { GPSLatitudeRef: "N" } } });
  return img.toBuffer();
}

const FIXTURE = await jpeg();

export function setup() {
  let now = new Date("2026-03-01T12:00:00Z");
  const uploadDir = mkdtempSync(join(tmpdir(), "stylegram-test-"));
  const ctx: Ctx = { db: openDb(":memory:"), config: { ...config, uploadDir, adminUsernames: ["admin"] }, now: () => now };
  const http = request(createApp(ctx));

  async function user(username: string, extra: Record<string, unknown> = {}) {
    const res = await http
      .post("/api/auth/register")
      .send({ username, email: `${username}@example.com`, password: "password123", displayName: username, ...extra })
      .expect(201);
    const token: string = res.body.token;
    const h = (r: request.Test) => r.set("Authorization", `Bearer ${token}`);
    return {
      token,
      body: res.body,
      get: (u: string) => h(http.get(u)),
      post: (u: string) => h(http.post(u)),
      put: (u: string) => h(http.put(u)),
      patch: (u: string) => h(http.patch(u)),
      del: (u: string) => h(http.delete(u)),
    };
  }

  type U = Awaited<ReturnType<typeof user>>;

  /** Create a verified brand account (registers it and has the admin verify it). */
  async function brand(username: string, name: string, admin: U, website = `https://${username}.example.com`) {
    const u = await user(username, { accountType: "BRAND", brand: { name, website } });
    await admin.post(`/api/admin/brands/${u.body.brand.slug}/verify`).send({ verified: true }).expect(204);
    return u;
  }

  function post(u: U, tags: unknown[] = [], images = 1, caption = "OOTD") {
    let r = u.post("/api/posts").field("caption", caption).field("tags", JSON.stringify(tags));
    for (let i = 0; i < images; i++) r = r.attach("images", FIXTURE, `p${i}.jpg`);
    return r;
  }

  return {
    ctx,
    http,
    user,
    brand,
    post,
    uploadDir,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}
