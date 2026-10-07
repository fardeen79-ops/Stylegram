import { describe, expect, it } from "vitest";
import { normalizeHttpUrl, slugify, withUtm } from "../src/util.js";

describe("util", () => {
  it("slugifies brand names", () => {
    expect(slugify("Levi's")).toBe("levi-s");
    expect(slugify("H&M")).toBe("h-and-m");
    expect(slugify("Hermès")).toBe("hermes");
    expect(slugify("  Dr. Martens ")).toBe("dr-martens");
  });
  it("accepts only http(s) URLs", () => {
    expect(normalizeHttpUrl("https://example.com/a")).toBe("https://example.com/a");
    expect(normalizeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeHttpUrl("data:text/html,hi")).toBeNull();
    expect(normalizeHttpUrl("http://localhost/x")).toBeNull();
  });
  it("adds UTM parameters without clobbering existing ones", () => {
    expect(withUtm("https://shop.example.com/p?id=1", "sg", "post_1")).toBe(
      "https://shop.example.com/p?id=1&utm_source=sg&utm_medium=social&utm_campaign=post_1",
    );
    expect(withUtm("https://shop.example.com/p?utm_source=x", "sg", "c")).toBe("https://shop.example.com/p?utm_source=x");
  });
});
