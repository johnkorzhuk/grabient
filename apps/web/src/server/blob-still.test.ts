import { blobStillKey, readBlobStillKey } from "@grabient/engine/effect.ts";
import { describe, expect, test } from "vitest";
import { blobStills } from "./blob-still.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const LOOK = { depth: true, fill: false, frost: 1, shape: 4242, bg: null } as const;
const page = (key: string) =>
  `<html><head><title>t</title></head><body><div class="b"><div class="s" data-blob-still="${key}"></div></div></body></html>`;

describe("a blob's still on its page", () => {
  test("its name reads back as the palette and the look it was written for", () => {
    const key = blobStillKey(SEED, LOOK);
    expect(readBlobStillKey(key)).toEqual({ seed: SEED, look: LOOK });
    const ground = blobStillKey(SEED, { ...LOOK, fill: true, frost: 0.35, bg: "#101014" });
    expect(readBlobStillKey(ground)?.look).toEqual({
      ...LOOK,
      fill: true,
      frost: 0.35,
      bg: "#101014"
    });
  });

  test("a name no page wrote names nothing", () => {
    for (const key of [
      "",
      "x",
      `${SEED}|1|0|1|4242`,
      `${SEED}|2|0|1|4242|`,
      `${SEED}|1|0|1.000|4242|`,
      `${SEED}|1|0|1|4242|red`,
      `<b>|1|0|1|4242|`
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
    const own = blobStills(page(blobStillKey(SEED, { ...LOOK, bg: "#101014" })));
    expect(own).toMatch(/no-repeat #101014\}<\/style>/);
    const none = blobStills(page(blobStillKey(SEED, LOOK)));
    expect(none).toMatch(/no-repeat\}<\/style>/);
  });

  test("a page without a holder, or naming no blob, is left as it was", () => {
    const plain = "<html><head></head><body><div></div></body></html>";
    expect(blobStills(plain)).toBe(plain);
    expect(blobStills(page("nothing|here"))).toBe(page("nothing|here"));
  });
});
