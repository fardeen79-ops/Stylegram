/**
 * Language detection for user-written text (captions, comments, bios), used to decide when to
 * offer "See translation". Returns an ISO 639-1 code ("en", "ar", "fr"…) or null when unsure.
 */
import { franc } from "franc-min";
import type { DB } from "./db.js";

export const UI_LANGUAGES = ["en", "ar"] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];

// Languages common in the UAE (ISO 639-3 → 639-1). Limiting the candidates avoids wild guesses.
const CANDIDATES: Record<string, string> = {
  eng: "en", arb: "ar", fra: "fr", hin: "hi", urd: "ur", rus: "ru", spa: "es", deu: "de", ita: "it",
  por: "pt", tgl: "tl", tur: "tr", pes: "fa", cmn: "zh", mal: "ml", tam: "ta", ben: "bn", jpn: "ja", kor: "ko",
};

/** Drop things that aren't language: links, @mentions, #hashtags, emoji, digits. */
function prose(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[@#][\p{L}\p{N}._]+/gu, " ")
    .replace(/[\p{Extended_Pictographic}\p{N}\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectLang(text: string | null | undefined): string | null {
  const t = prose(text ?? "");
  const letters = t.replace(/[^\p{L}]/gu, "");
  if (letters.length < 3) return null;
  const arabicScript = (t.match(/[؀-ۿݐ-ݿ]/g) ?? []).length / letters.length;
  if (letters.length >= 20) {
    const code = CANDIDATES[franc(t, { minLength: 10, only: Object.keys(CANDIDATES) })];
    if (code) return code;
  }
  // Short text: trust the script for Arabic; short Latin text is too ambiguous to label.
  if (arabicScript > 0.6) return "ar";
  return null;
}

/** Stored as "" when checked but unknown, so it isn't re-detected on every start. */
export const toStored = (lang: string | null) => lang ?? "";
export const fromStored = (lang: string | null | undefined) => (lang ? lang : null);

/** Detect languages for rows saved before detection existed (runs at startup; cheap, local). */
export function backfillLanguages(db: DB): void {
  const jobs: [string, string, string][] = [
    ["posts", "caption", "caption_lang"],
    ["comments", "body", "lang"],
    ["users", "bio", "bio_lang"],
  ];
  for (const [table, textCol, langCol] of jobs) {
    const rows = db.prepare(`SELECT id, ${textCol} AS text FROM ${table} WHERE ${langCol} IS NULL`).all() as { id: number; text: string }[];
    const update = db.prepare(`UPDATE ${table} SET ${langCol} = ? WHERE id = ?`);
    db.transaction(() => rows.forEach((r) => update.run(toStored(detectLang(r.text)), r.id)))();
  }
}
