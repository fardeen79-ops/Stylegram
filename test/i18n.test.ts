import Anthropic from "@anthropic-ai/sdk";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { BASE_SCHEMA, migrate } from "../src/db.js";
import { backfillLanguages, detectLang } from "../src/lang.js";
import { ClaudeTranslator, type Translator } from "../src/translate.js";
import { setup } from "./helpers.js";

class FakeTranslator implements Translator {
  readonly model = "fake";
  calls = 0;
  fail = false;
  async translate(text: string, to: string) {
    this.calls++;
    if (this.fail) throw new Error("down");
    return `[${to}] ${text}`;
  }
}

const AR_CAPTION = "إطلالة العيد مع عباءة سوداء أنيقة من متجري المفضل ✨ #عيد";
const EN_CAPTION = "Denim on denim for a cool Dubai evening, swipe for the pieces";

describe("language detection", () => {
  it("detects Arabic, English and other languages, and stays quiet when unsure", () => {
    expect(detectLang(AR_CAPTION)).toBe("ar");
    expect(detectLang(EN_CAPTION)).toBe("en");
    expect(detectLang("Une belle soirée à Dubaï avec mes amis ce weekend")).toBe("fr");
    expect(detectLang("ما شاء الله 👌")).toBe("ar"); // short, but clearly Arabic script
    expect(detectLang("Linen king.")).toBeNull(); // short Latin text is ambiguous
    expect(detectLang("🔥🔥 #ootd @noor")).toBeNull();
  });

  it("backfills languages for text written before detection existed", () => {
    const db = new Database(":memory:");
    db.exec(BASE_SCHEMA);
    db.prepare("INSERT INTO users (username, email, password_hash, display_name, account_type, created_at) VALUES ('a','a@x.com','x','A','PERSONAL','2026-01-01')").run();
    db.prepare("INSERT INTO posts (user_id, caption, created_at) VALUES (1, ?, '2026-01-01')").run(AR_CAPTION);
    migrate(db);
    backfillLanguages(db);
    expect(db.prepare("SELECT caption_lang FROM posts").get()).toEqual({ caption_lang: "ar" });
    expect(db.prepare("SELECT ui_lang, bio_lang FROM users").get()).toEqual({ ui_lang: "en", bio_lang: "" });
  });
});

describe("interface language preference", () => {
  it("is chosen at sign-up and can be changed", async () => {
    const t = setup();
    const noor = await t.user("noor", { language: "ar" });
    expect(noor.body.user.language).toBe("ar");
    await noor.patch("/api/me").send({ language: "en" }).expect(200);
    expect((await noor.get("/api/me").expect(200)).body.language).toBe("en");
    await noor.patch("/api/me").send({ language: "fr" }).expect(400);
  });

  it("exposes the detected language of captions, comments and bios", async () => {
    const t = setup();
    const noor = await t.user("noor");
    await noor.patch("/api/me").send({ bio: "مدونة أزياء من دبي، أحب الموضة المحتشمة" }).expect(200);
    const post = (await t.post(noor, [], 1, AR_CAPTION).expect(201)).body;
    expect(post.captionLang).toBe("ar");
    await noor.post(`/api/posts/${post.id}/comments`).send({ body: "Love this abaya, the detail on the cuffs is beautiful" }).expect(201);
    const view = (await t.http.get(`/api/posts/${post.id}`).expect(200)).body;
    expect(view.recentComments[0].lang).toBe("en");
    expect((await t.http.get("/api/users/noor").expect(200)).body.bioLang).toBe("ar");
  });
});

describe("translation", () => {
  it("translates into the reader's chosen language and caches the result", async () => {
    const translator = new FakeTranslator();
    const t = setup();
    t.ctx.translator = translator;
    const noor = await t.user("noor", { language: "ar" });
    const omar = await t.user("omar", { language: "en" });
    const post = (await t.post(noor, [], 1, AR_CAPTION).expect(201)).body;

    const en = await omar.post("/api/translate").send({ kind: "post", id: post.id }).expect(200);
    expect(en.body).toEqual({ text: `[en] ${AR_CAPTION}`, from: "ar", to: "en" });
    await omar.post("/api/translate").send({ kind: "post", id: post.id }).expect(200);
    expect(translator.calls).toBe(1); // cached

    // Already in the reader's language: returned as-is, no model call.
    const same = await noor.post("/api/translate").send({ kind: "post", id: post.id }).expect(200);
    expect(same.body.text).toBe(AR_CAPTION);
    expect(translator.calls).toBe(1);

    const c = (await omar.post(`/api/posts/${post.id}/comments`).send({ body: "This is such a beautiful look for Eid, well done" }).expect(201)).body;
    const ar = await noor.post("/api/translate").send({ kind: "comment", id: c.id }).expect(200);
    expect(ar.body).toMatchObject({ from: "en", to: "ar", text: "[ar] This is such a beautiful look for Eid, well done" });

    await noor.patch("/api/me").send({ bio: "Abu Dhabi based, menswear and minimal outfits every day" }).expect(200);
    const bio = await omar.post("/api/translate").send({ kind: "bio", id: "noor" }).expect(200);
    expect(bio.body.text).toBe("Abu Dhabi based, menswear and minimal outfits every day"); // already English
  });

  it("handles missing text, failures, logged-out users, rate limits and no API key", async () => {
    const translator = new FakeTranslator();
    const t = setup({ config: { ai: { model: "fake", analysesPerHour: 60, translationsPerHour: 1 } } });
    const noor = await t.user("noor", { language: "ar" });
    const omar = await t.user("omar");
    await omar.post("/api/translate").send({ kind: "post", id: 999 }).expect(501); // no translator configured
    t.ctx.translator = translator;
    await omar.post("/api/translate").send({ kind: "post", id: 999 }).expect(404);
    const p1 = (await t.post(noor, [], 1, AR_CAPTION).expect(201)).body;
    const p2 = (await t.post(noor, [], 1, "صباح الخير من دبي، يوم جميل للتسوق في المول").expect(201)).body;
    await t.http.post("/api/translate").send({ kind: "post", id: p1.id }).expect(401);
    translator.fail = true;
    await omar.post("/api/translate").send({ kind: "post", id: p1.id }).expect(503);
    translator.fail = false;
    await omar.post("/api/translate").send({ kind: "post", id: p2.id }).expect(429); // 1 new translation per hour
  });
});

describe("ClaudeTranslator", () => {
  it("wraps the user's text as content and asks for structured output", async () => {
    const seen: any[] = [];
    const fetch = async (_url: string | URL | Request, init?: RequestInit) => {
      seen.push(JSON.parse(String(init?.body)));
      const body = {
        id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 50, output_tokens: 20 },
        content: [{ type: "text", text: JSON.stringify({ translation: "Eid look ✨ #عيد" }) }],
      };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    };
    const client = new Anthropic({ apiKey: "k", fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
    const out = await new ClaudeTranslator("claude-opus-5-5", client).translate("إطلالة العيد ✨ #عيد", "en");
    expect(out).toBe("Eid look ✨ #عيد");
    expect(seen[0].messages[0].content).toContain("<text>\nإطلالة العيد ✨ #عيد\n</text>");
    expect(seen[0].messages[0].content).toContain("Translate into English");
    expect(seen[0]).toMatchObject({ fallbacks: "default", output_config: { format: { type: "json_schema" } } });
  });
});
