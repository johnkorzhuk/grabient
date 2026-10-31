import { blobStillKey, readBlobStillKey } from "@grabient/engine/effect.ts";
import { describe, expect, test } from "vitest";
import { blobStills } from "./blob-still.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const LOOK = { frost: 1, shape: 4242, bg: null } as const;
const page = (key: string) =>
  `<html><head><title>t</title></head><body><div class="b"><div class="s" data-blob-still="${key}"></div></div></body></html>`;

describe("a blob's still on its page", () => {
  test("its name reads back as the palette, the look and the angle it was written for", () => {
    const key = blobStillKey(SEED, LOOK, 90);
    expect(readBlobStillKey(key)).toEqual({ seed: SEED, look: LOOK, angle: 90 });
    const ground = blobStillKey(SEED, { ...LOOK, frost: 0.35, bg: "#10101480" }, 135);
    expect(readBlobStillKey(ground)).toEqual({
      seed: SEED,
      look: { ...LOOK, frost: 0.35, bg: "#10101480" },
      angle: 135
    });
  });

  test("a name no page wrote names nothing", () => {
    for (const key of [
      "",
      "x",
      `${SEED}|1|4242|`,
      `${SEED}|1.000|4242||90`,
      `${SEED}|1|4242|red|90`,
      `${SEED}|1|4242||400`,
      `${SEED}|1|4242||9.5`,
      `<b>|1|4242||90`
    ])
      expect(readBlobStillKey(key)).toBeNull();
  });

  test("the server writes the still into the head, a style for the holder's name, and nothing else", () => {
    const key = blobStillKey(SEED, LOOK, 90);
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
    const own = blobStills(page(blobStillKey(SEED, { ...LOOK, bg: "#10101480" }, 90)));
    expect(own).toMatch(/no-repeat #10101480\}<\/style>/);
    const none = blobStills(page(blobStillKey(SEED, LOOK, 90)));
    expect(none).toMatch(/no-repeat\}<\/style>/);
  });

  test("a page without a holder, or naming no blob, is left as it was", () => {
    const plain = "<html><head></head><body><div></div></body></html>";
    expect(blobStills(plain)).toBe(plain);
    expect(blobStills(page("nothing|here"))).toBe(page("nothing|here"));
  });
});
