import { blobStillKey, readBlobStillKey } from "@grabient/engine/effect.ts";
import { describe, expect, test } from "vitest";
import { blobStills } from "./blob-still.ts";
import { FIRST_SCREEN_STILLS } from "./stills.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const LOOK = { frost: 1, shape: 424, bg: null } as const;
const page = (key: string) =>
  `<html><head><title>t</title></head><body><div class="b"><div class="s" data-blob-still="${key}"></div></div></body></html>`;

describe("a blob's still on its page", () => {
  test("its name reads back as the palette and the look it was written for", () => {
    const key = blobStillKey(SEED, LOOK);
    expect(readBlobStillKey(key)).toEqual({ seed: SEED, look: LOOK });
    const ground = blobStillKey(SEED, { ...LOOK, frost: 0.35, bg: "#10101480" });
    expect(readBlobStillKey(ground)).toEqual({
      seed: SEED,
      look: { ...LOOK, frost: 0.35, bg: "#10101480" }
    });
  });

  test("a name no page wrote names nothing", () => {
    for (const key of [
      "",
      "x",
      `${SEED}|1|424`,
      `${SEED}|1.000|424|`,
      `${SEED}|1|424|red`,
      `<b>|1|424|`,
      // a shape is 0 to 999
      `${SEED}|1|4242|`,
      // the blob has no angle: a name that ends in one, as names did, names nothing
      `${SEED}|1|424||90`
    ])
      expect(readBlobStillKey(key)).toBeNull();
  });

  test("the server writes the still into the head, a style for the holder's name, and nothing else", () => {
    const key = blobStillKey(SEED, LOOK);
    const html = blobStills(page(key));
    const style = /<style id="blob-still" data-key="([^"]*)">([^<]*)<\/style><\/head>/.exec(html);
    expect(style?.[1]).toBe(key);
    expect(style?.[2]).toMatch(
      new RegExp(
        `^\\[data-blob-still="${key.replace(/[|]/g, "\\|")}"\\]\\{background:url\\("data:image/svg\\+xml,`
      )
    );
    expect(html.replace(/<style id="blob-still"[^<]*<\/style>/, "")).toBe(page(key));
  });

  test("a blob with a ground of its own paints it under the still; one without leaves the page's", () => {
    const own = blobStills(page(blobStillKey(SEED, { ...LOOK, bg: "#10101480" })));
    expect(own).toMatch(/no-repeat #10101480\}<\/style>/);
    const none = blobStills(page(blobStillKey(SEED, LOOK)));
    expect(none).toMatch(/no-repeat\}<\/style>/);
  });

  test("a list's cards each name a still: one rule a name, as many as a first screen shows", () => {
    const cards = (keys: string[]) =>
      `<html><head></head><body>${keys.map(k => `<span class="c" data-blob-still="${k}"></span>`).join("")}</body></html>`;
    const keys = [424, 45, 424, 10].map(shape => blobStillKey(SEED, { ...LOOK, shape }));
    const html = blobStills(cards(keys));
    expect(/<style id="blob-still" data-key="([^"]*)">/.exec(html)?.[1]).toBe(
      [keys[0], keys[1], keys[3]].join(" ")
    );
    expect(html.match(/\]\{background:/g)).toHaveLength(3);
    const many = Array.from({ length: FIRST_SCREEN_STILLS + 5 }, (_, shape) =>
      blobStillKey(SEED, { ...LOOK, shape })
    );
    const capped = blobStills(cards(many));
    expect(capped.match(/\]\{background:/g)).toHaveLength(FIRST_SCREEN_STILLS);
    expect(capped).toContain(`[data-blob-still="${many[FIRST_SCREEN_STILLS - 1]}"]`);
    expect(capped).not.toContain(`[data-blob-still="${many[FIRST_SCREEN_STILLS]}"]`);
  });

  test("a page without a holder, or naming no blob, is left as it was", () => {
    const plain = "<html><head></head><body><div></div></body></html>";
    expect(blobStills(plain)).toBe(plain);
    expect(blobStills(page("nothing|here"))).toBe(page("nothing|here"));
  });
});
