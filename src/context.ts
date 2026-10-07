import type { Config } from "./config.js";
import type { DB } from "./db.js";
import type { ImageAI } from "./ai.js";
import type { Translator } from "./translate.js";

export interface Ctx {
  db: DB;
  config: Config;
  /** Injectable clock so tests can control time (expiry, daily limits, PIN lockout). */
  now: () => Date;
  /** Vision model for photo safety checks and item suggestions. Absent when no API key is configured. */
  ai?: ImageAI;
  /** Translates user text into the reader's language. Absent when no API key is configured. */
  translator?: Translator;
}
