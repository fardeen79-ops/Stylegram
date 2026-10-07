import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeImageAI, ImageRefusedError, isBlocked } from "../src/ai.js";

/** An Anthropic client whose HTTP layer returns a canned response and records the request. */
function fakeClient(reply: Record<string, unknown>) {
  const seen: { url: string; headers: Headers; body: any }[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  };
  const client = new Anthropic({ apiKey: "test-key", fetch: fetch as typeof globalThis.fetch, maxRetries: 0 });
  return { client, seen };
}

const message = (over: Record<string, unknown>) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  stop_sequence: null,
  usage: { input_tokens: 1500, output_tokens: 120 },
  ...over,
});

describe("ClaudeImageAI", () => {
  it("sends the photo with a structured-output schema and the fallback opt-in, and parses the result", async () => {
    const result = {
      safety: { verdict: "safe", minor_concern: false, reason: "Clothed outfit." },
      items: [{ label: "Denim jacket", category: "outerwear", x: 0.5, y: 0.4, brand: null }],
    };
    const { client, seen } = fakeClient(message({ content: [{ type: "text", text: JSON.stringify(result) }], stop_reason: "end_turn" }));
    const ai = new ClaudeImageAI("claude-opus-5-5", client);
    const out = await ai.analyze(Buffer.from("fake-jpeg"));
    expect(out).toEqual(result);

    const req = seen[0]!;
    expect(req.url).toContain("/v1/messages");
    expect(req.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(req.body).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", output_config: { effort: "low", format: { type: "json_schema" } } });
    expect(req.body.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: Buffer.from("fake-jpeg").toString("base64") },
    });
    expect(req.body.output_config.format.schema.properties).toHaveProperty("safety");
  });

  it("omits options a cheaper model doesn't support", async () => {
    const result = { safety: { verdict: "safe", minor_concern: false, reason: "ok" }, items: [] };
    const { client, seen } = fakeClient(message({ content: [{ type: "text", text: JSON.stringify(result) }], stop_reason: "end_turn" }));
    await new ClaudeImageAI("claude-haiku-4-5", client).analyze(Buffer.from("x"));
    expect(seen[0]!.body).not.toHaveProperty("fallbacks");
    expect(seen[0]!.body.output_config).not.toHaveProperty("effort");
    expect(seen[0]!.body.output_config.format.type).toBe("json_schema");
  });

  it("treats a model refusal as an error the caller handles as unsafe", async () => {
    const { client } = fakeClient(message({ content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: null, explanation: null } }));
    await expect(new ClaudeImageAI("claude-opus-5-5", client).analyze(Buffer.from("x"))).rejects.toBeInstanceOf(ImageRefusedError);
  });

  it("blocks nudity, sexual content and anything concerning minors, but allows swimwear", () => {
    const v = (verdict: any, minor = false) => isBlocked({ safety: { verdict, minor_concern: minor, reason: "" } });
    expect([v("safe"), v("swimwear_or_underwear")]).toEqual([false, false]);
    expect([v("partial_nudity"), v("explicit_nudity"), v("sexual_activity"), v("safe", true)]).toEqual([true, true, true, true]);
  });
});
