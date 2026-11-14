import { fxStillKey } from "@grabient/engine/effect.ts";
import { FX_PICTURE_VERSION, fxPictureAddress } from "@grabient/engine/fx-picture.ts";
import { readFxStillKey } from "@grabient/engine/fx-still.ts";
import { describe, expect, test } from "vitest";
import { fxStills } from "./fx-still.ts";
import { FIRST_SCREEN_STILLS } from "./stills.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const page = (key: string) =>
  `<html><head><title>t</title></head><body><div class="b"><div class="s" data-fx-still="${key}"></div></div></body></html>`;

describe("a silk's, a rosette's or a papercut's still on its page", () => {
  test("its name reads back as the kind, the palette and the look it was written for", () => {
    for (const kind of ["silk", "rosette", "papercut"] as const)
      for (const look of [
        { angle: 90, shape: null, steps: null, zoom: null, path: null, bg: null },
        { angle: 0, shape: 0, steps: null, zoom: null, path: null, bg: null },
        { angle: 315, shape: 999, steps: null, zoom: null, path: null, bg: null }
      ]) {
        const key = fxStillKey(kind, SEED, look);
        expect(readFxStillKey(key)).toEqual({ kind, seed: SEED, look });
      }
  });

  test("the sandstone's names its steps where its look names them, and reads them back; any other spelling names nothing", () => {
    for (const steps of [null, 8, 12, 40]) {
      const look = { angle: 135, shape: 7, steps, zoom: null, path: null, bg: null };
      const key = fxStillKey("strata", SEED, look);
      expect(readFxStillKey(key)).toEqual({ kind: "strata", seed: SEED, look });
    }
    expect(
      fxStillKey("strata", SEED, {
        angle: 90,
        shape: null,
        steps: 12,
        zoom: null,
        path: null,
        bg: null
      })
    ).toBe(`strata|${SEED}|90||12`);
    /* its designed steps written out, steps past its range, and steps for an effect that takes none */
    for (const key of [
      `strata|${SEED}|90||28`,
      `strata|${SEED}|90||99`,
      `strata|${SEED}|90||3`,
      `strata|${SEED}|90||x`,
      `papercut|${SEED}|90||12`
    ])
      expect(readFxStillKey(key), key).toBeNull();
    /* and the server paints it as it paints any */
    const key = fxStillKey("strata", SEED, {
      angle: 90,
      shape: null,
      steps: 12,
      zoom: null,
      path: null,
      bg: null
    });
    expect(/<style id="fx-still" data-key="([^"]*)">/.exec(fxStills(page(key)))?.[1]).toBe(key);
  });

  test("a name no page wrote names nothing", () => {
    for (const key of [
      "",
      "x",
      `glass|${SEED}|90|`,
      `blob|${SEED}|90|`,
      `silk|${SEED}|90`,
      `silk|${SEED}|90|7|`,
      `silk|${SEED}|361|`,
      `silk|${SEED}|090|`,
      `rosette|${SEED}|90|1000`,
      `rosette|<b>|90|`,
      `paper|${SEED}|90|`,
      /* an effect the site plays no more (the zen garden, 8 to 10 Nov 2026), as a page kept from then names it */
      `zen|${SEED}|90|`
    ])
      expect(readFxStillKey(key)).toBeNull();
  });

  test("the server writes the still into the head, a style for the holder's name, and nothing else", () => {
    const key = fxStillKey("rosette", SEED, {
      angle: 120,
      shape: 7,
      steps: null,
      zoom: null,
      path: null,
      bg: null
    });
    const html = fxStills(page(key));
    const style = /<style id="fx-still" data-key="([^"]*)">([^<]*)<\/style><\/head>/.exec(html);
    expect(style?.[1]).toBe(key);
    expect(style?.[2]).toMatch(
      new RegExp(
        `^\\[data-fx-still="${key.replace(/[|]/g, "\\|")}"\\]\\{background:url\\("data:image/svg\\+xml,`
      )
    );
    /* the one design covering any box, centered, as the player lays the box out */
    expect(style?.[2]).toMatch(/\) 50% 50% \/ cover no-repeat\}$/);
    /* a plain SVG: no filter for a list of them to paint */
    expect(style?.[2]).not.toMatch(/filter/);
    expect(html.replace(/<style id="fx-still"[^<]*<\/style>/, "")).toBe(page(key));
  });

  test("the papercut's still in the head is its stepped one, its shadows strokes, no blur", () => {
    const key = fxStillKey("papercut", SEED, {
      angle: 30,
      shape: 7,
      steps: null,
      zoom: null,
      path: null,
      bg: null
    });
    const html = fxStills(page(key));
    const style = /<style id="fx-still" data-key="([^"]*)">([^<]*)<\/style><\/head>/.exec(html);
    expect(style?.[1]).toBe(key);
    expect(style?.[2]).toMatch(/\) 50% 50% \/ cover no-repeat\}$/);
    expect(style?.[2]).not.toMatch(/filter|feGaussianBlur/);
    expect(style?.[2]).toContain("stroke-width");
  });

  test("a list's cards each name a still: one rule a name, as many as a first screen shows", () => {
    const cards = (keys: string[]) =>
      `<html><head></head><body>${keys.map(k => `<span class="c" data-fx-still="${k}"></span>`).join("")}</body></html>`;
    const keys = [3, 45, 3, 10].map(shape =>
      fxStillKey("silk", SEED, { angle: 90, shape, steps: null, zoom: null, path: null, bg: null })
    );
    const html = fxStills(cards(keys));
    expect(/<style id="fx-still" data-key="([^"]*)">/.exec(html)?.[1]).toBe(
      [keys[0], keys[1], keys[3]].join(" ")
    );
    expect(html.match(/\]\{background:/g)).toHaveLength(3);
    const many = Array.from({ length: FIRST_SCREEN_STILLS + 5 }, (_, shape) =>
      fxStillKey("rosette", SEED, {
        angle: 90,
        shape,
        steps: null,
        zoom: null,
        path: null,
        bg: null
      })
    );
    const capped = fxStills(cards(many));
    expect(capped.match(/\]\{background:/g)).toHaveLength(FIRST_SCREEN_STILLS);
    expect(capped).not.toContain(`[data-fx-still="${many[FIRST_SCREEN_STILLS]}"]`);
  });

  test("the aurora's still in the head is its picture's address, the first preloaded, and no drawing", () => {
    const look = (shape: number | null, path: string | null, bg: string | null) => ({
      angle: 90,
      shape,
      steps: null,
      zoom: null,
      path,
      bg
    });
    const keys = [
      fxStillKey("aurora", SEED, look(null, null, null)),
      fxStillKey("aurora", SEED, look(417, "line,25,25,curve,45,60,45,25", "#0b0b10")),
      fxStillKey("silk", SEED, look(3, null, null))
    ];
    const html = fxStills(
      `<html><head></head><body>${keys.map(k => `<span data-fx-still="${k}"></span>`).join("")}</body></html>`
    );
    expect(/<style id="fx-still" data-key="([^"]*)">/.exec(html)?.[1]).toBe(keys.join(" "));
    for (const key of keys.slice(0, 2))
      expect(html).toContain(
        `[data-fx-still="${key}"]{background:url("/api/fx-still?k=${encodeURIComponent(key)}&v=${FX_PICTURE_VERSION}") 50% 50% / cover no-repeat}`
      );
    /* the silk's as ever, a plain SVG */
    expect(html).toContain(`[data-fx-still="${keys[2]}"]{background:url("data:image/svg+xml,`);
    /* the first picture asked for from the head, the second as its card is laid out */
    expect(html.match(/<link rel="preload"[^>]*>/g)).toEqual([
      `<link rel="preload" as="image" href="/api/fx-still?k=${encodeURIComponent(keys[0])}&amp;v=${FX_PICTURE_VERSION}" fetchpriority="high">`
    ]);
    /* a page whose first still is no picture asks for none from its head */
    const later = fxStills(
      `<html><head></head><body>${[keys[2], keys[0]].map(k => `<span data-fx-still="${k}"></span>`).join("")}</body></html>`
    );
    expect(later).toContain(`[data-fx-still="${keys[0]}"]{background:url("/api/fx-still?`);
    expect(later).not.toContain('<link rel="preload"');
    /* the address reads back as the holder's name */
    const k = new URL(fxPictureAddress(keys[1]), "https://grabient.test").searchParams.get("k");
    expect(k).toBe(keys[1]);
  });

  test("a page without a holder, or naming no still, is left as it was", () => {
    const plain = "<html><head></head><body><div></div></body></html>";
    expect(fxStills(plain)).toBe(plain);
    expect(fxStills(page("nothing|here"))).toBe(page("nothing|here"));
  });
});
