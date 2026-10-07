import { createHash } from "node:crypto";
import type { Ctx } from "../context.js";
import { AppError } from "../errors.js";
import { detectLang, fromStored } from "../lang.js";
import { getUser, getUserByUsername } from "./users.js";

export type TranslatableKind = "post" | "comment" | "bio";

/** The text of a caption, comment or bio, with its detected language. */
function source(ctx: Ctx, kind: TranslatableKind, id: string): { text: string; lang: string | null } {
  const row =
    kind === "post"
      ? (ctx.db.prepare("SELECT caption AS text, caption_lang AS lang FROM posts WHERE id = ?").get(Number(id)) as
          | { text: string; lang: string | null }
          | undefined)
      : kind === "comment"
        ? (ctx.db.prepare("SELECT body AS text, lang FROM comments WHERE id = ?").get(Number(id)) as
            | { text: string; lang: string | null }
            | undefined)
        : (() => {
            const u = getUserByUsername(ctx, id);
            return { text: u.bio, lang: u.bio_lang };
          })();
  if (!row || !row.text.trim()) throw new AppError("NOT_FOUND", "Nothing to translate");
  return { text: row.text, lang: fromStored(row.lang) ?? detectLang(row.text) };
}

/** Whether the text needs a model call (it isn't cached yet), for rate limiting. */
export function needsModel(ctx: Ctx, userId: number, kind: TranslatableKind, id: string): boolean {
  const { text } = source(ctx, kind, id);
  const to = getUser(ctx, userId).ui_lang;
  return !ctx.db.prepare("SELECT 1 FROM translations WHERE hash = ? AND target = ?").get(hashText(text), to);
}

const hashText = (t: string) => createHash("sha256").update(t).digest("hex");

/** Translate a caption, comment or bio into the user's chosen language (cached per text and language). */
export async function translateContent(ctx: Ctx, userId: number, kind: TranslatableKind, id: string) {
  if (!ctx.translator) throw new AppError("AI_DISABLED", "Translation isn't set up on this server");
  const { text, lang } = source(ctx, kind, id);
  const to = getUser(ctx, userId).ui_lang;
  if (lang === to) return { text, from: lang, to };
  const hash = hashText(text);
  const cached = ctx.db.prepare("SELECT text FROM translations WHERE hash = ? AND target = ?").get(hash, to) as
    | { text: string }
    | undefined;
  if (cached) return { text: cached.text, from: lang, to };
  let translated: string;
  try {
    translated = await ctx.translator.translate(text, to);
  } catch (err) {
    console.error("Translation failed:", err);
    throw new AppError("AI_UNAVAILABLE", "Translation isn't available right now. Please try again.");
  }
  ctx.db
    .prepare("INSERT OR REPLACE INTO translations (hash, target, text, model, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(hash, to, translated, ctx.translator.model, ctx.now().toISOString());
  return { text: translated, from: lang, to };
}
