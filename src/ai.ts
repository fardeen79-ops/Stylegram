/**
 * Photo understanding with Claude (vision): one call per uploaded photo returns
 *  1. a safety verdict, used to block nudity, pornography and any sexualised depiction of minors, and
 *  2. the clothing and accessories visible, with approximate positions, to suggest product tags.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { CATEGORIES } from "./db.js";

export const VERDICTS = ["safe", "swimwear_or_underwear", "partial_nudity", "explicit_nudity", "sexual_activity"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Verdicts that are never allowed on Stylegram. Swimwear and underwear modelled normally are fine. */
export const BLOCKED_VERDICTS: ReadonlySet<Verdict> = new Set(["partial_nudity", "explicit_nudity", "sexual_activity"]);

export const ImageAnalysisSchema = z.object({
  safety: z.object({
    verdict: z.enum(VERDICTS),
    minor_concern: z.boolean(),
    reason: z.string(),
  }),
  items: z.array(
    z.object({
      label: z.string(),
      category: z.enum(CATEGORIES),
      x: z.number(),
      y: z.number(),
      brand: z.string().nullable(),
    }),
  ),
});
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;

export interface ImageAI {
  readonly model: string;
  /** Analyse a JPEG. Throws on API/network failure (callers fail closed). */
  analyze(jpeg: Buffer): Promise<ImageAnalysis>;
}

/** The model declined to look at the image; treated as unsafe. */
export class ImageRefusedError extends Error {}

const SYSTEM_PROMPT = `You review photos uploaded to Stylegram, a fashion app where people share outfits and tag the clothes and accessories they're wearing.

For each photo, return two things.

safety — decide whether the photo can be shown publicly:
- "safe": no nudity or sexual content.
- "swimwear_or_underwear": swimwear, lingerie or underwear worn or modelled in an ordinary, non-sexual way. This is allowed; fashion photos often look like this.
- "partial_nudity": exposed female nipples or fully exposed buttocks, including see-through clothing that shows them.
- "explicit_nudity": exposed genitals.
- "sexual_activity": sexual acts, sexually explicit poses or pornographic framing, even if clothed.
Set minor_concern to true if anyone who may be under 18 is shown nude, partially nude, or in a sexualised way. Give a short, neutral reason (one sentence) for the verdict.

items — the clothing, shoes, bags and accessories visible in the photo (at most 10, most prominent first):
- label: a short shopper-friendly name, e.g. "Black leather Chelsea boots" or "Light-wash straight jeans".
- category: the closest category from the allowed list.
- x, y: the centre of the item as fractions of the image width and height (0 = left/top, 1 = right/bottom).
- brand: only when a brand name or logo is clearly legible on the item; otherwise null. Never guess a brand from style alone.
Return an empty items list for photos without clothing or accessories.`;

/** Models that accept server-side `fallbacks: "default"`; others are called without it. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5", "claude-fable-5-1"]);
/** Haiku 4.5 rejects the `effort` setting. */
const supportsEffort = (model: string) => !model.startsWith("claude-haiku-4-5");

export class ClaudeImageAI implements ImageAI {
  private readonly client: Anthropic;

  constructor(
    readonly model: string,
    client?: Anthropic,
  ) {
    // Credentials come from the environment (ANTHROPIC_API_KEY on Railway). SDK retries 429/5xx twice.
    this.client = client ?? new Anthropic({ timeout: 60_000, maxRetries: 2 });
  }

  async analyze(jpeg: Buffer): Promise<ImageAnalysis> {
    const fallback = FALLBACK_MODELS.has(this.model);
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 4000,
      // If a safety classifier declines, retry server-side on Anthropic's recommended fallback model.
      ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      output_config: {
        ...(supportsEffort(this.model) ? { effort: "low" as const } : {}),
        format: betaZodOutputFormat(ImageAnalysisSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
            { type: "text", text: "Review this photo." },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new ImageRefusedError("The model declined to review this image");
    if (!response.parsed_output) throw new Error(`No structured result (stop_reason: ${response.stop_reason})`);
    return response.parsed_output;
  }
}

/** Whether an analysis means the photo must be rejected. */
export function isBlocked(a: Pick<ImageAnalysis, "safety">): boolean {
  return a.safety.minor_concern || BLOCKED_VERDICTS.has(a.safety.verdict);
}
