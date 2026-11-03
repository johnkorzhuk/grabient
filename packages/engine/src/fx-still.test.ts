import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import type { Effect } from "./effect.ts";
import { hasEmbedScript } from "./effect.ts";
import {
  effectColors,
  effectLinks,
  effectMarkdown,
  effectStylesheet,
  effectSvg
} from "./effect-code.ts";
import { effectEmbedHtml } from "./effect-embed.ts";
import { effectBlurSigma } from "./fx-finish.ts";
import {
  FX_STILL_SIDE,
  fxLoop,
  fxMovingSvg,
  fxStillBackground,
  fxStillSteps,
  fxStillSvg
} from "./fx-still.ts";
import { PAPERCUT_SVG_FRAMES } from "./papercut-svg.ts";

const SEED = "kUMzO5Na871ukuyhHUJA";
const P = decodePalette(SEED)!;
const effect = (kind: "silk" | "rosette", speed = 1): Effect => ({
  kind,
  speed,
  fps: 60,
  look: { shape: 7, frost: 1, bg: null }
});

test("a still is drawn in the design square, and speed 0 is the still", () => {
  for (const kind of ["silk", "rosette"] as const) {
    const still = fxStillSvg(kind, P, { angle: 90, shape: null });
    expect(still).toContain(`width="${FX_STILL_SIDE}" height="${FX_STILL_SIDE}"`);
    const box = { width: 400, height: 200 };
    expect(fxMovingSvg(kind, P, { angle: 30, shape: 3 }, box, 0)).toBe(
      fxStillSvg(kind, P, { angle: 30, shape: 3 }, box)
    );
    expect(fxLoop(kind, P, { angle: 90, shape: null })).toBeGreaterThan(0);
  }
});

test("the silk's and the rosette's files: a moving SVG, a stylesheet, their colors, the script that plays them", () => {
  for (const kind of ["silk", "rosette"] as const) {
    expect(hasEmbedScript(kind)).toBe(true);
    const fx = effect(kind);
    const svg = effectSvg(P, SEED, fx, 120, { width: 640, height: 320 }, "https://grabient.com");
    expect(svg).toMatch(/^<svg[^>]*width="640" height="320"/);
    expect(svg).toContain(`<!-- https://grabient.com/${SEED}?style=${kind}&angle=120&shape=7 -->`);
    expect(svg).toMatch(kind === "silk" ? /<animateTransform/ : /@keyframes/);
    const css = effectStylesheet(P, SEED, fx, 120, "https://grabient.com");
    expect(css).toContain("html::before");
    expect(css).toMatch(/50% 50% \/ cover no-repeat/);
    expect(effectColors(P, fx)).toHaveLength(6);
    expect(effectLinks("https://grabient.com", SEED, fx, 120, "/og").js).toBe(
      `https://grabient.com/${SEED}.js?style=${kind}&angle=120&shape=7`
    );
    expect(effectEmbedHtml("https://grabient.com", SEED, fx, 120)).toContain(
      `<script src="https://grabient.com/${SEED}.js?style=${kind}&amp;angle=120&amp;shape=7" async></script>`
    );
    const md = effectMarkdown(
      "https://grabient.com",
      SEED,
      fx,
      "/og"
    )(P, "Navy and teal", {
      angle: 120,
      colors: effectColors(P, fx)
    } as never);
    expect(md.called).toBe(`Navy and teal ${kind}`);
    expect(md.files).toHaveProperty("script");
  }
});

test("the papercut's files: its stepped still covers a page, its SVG moves by its stills fading one into the next and holds the still blurred, the script that plays it", () => {
  const fx: Effect = {
    kind: "papercut",
    speed: 1,
    fps: 60,
    look: { shape: 7, frost: 1, bg: null }
  };
  expect(hasEmbedScript("papercut")).toBe(true);
  const still = fxStillSvg("papercut", P, { angle: 90, shape: null });
  expect(still).toContain(`width="${FX_STILL_SIDE}" height="${FX_STILL_SIDE}"`);
  expect(still).not.toContain("<filter");
  const box = { width: 640, height: 320 };
  /* held, its first frame with its shadows blurred, as a design app imports them */
  const held = fxMovingSvg("papercut", P, { angle: 120, shape: 7 }, box, 0);
  expect(held).toContain("<feGaussianBlur");
  /* moving: its stills at even times of the loop, each fading in over the one before, the first again over the last,
     every one but the first hidden until its animation shows it, and no filter */
  const file = fxMovingSvg("papercut", P, { angle: 120, shape: 7 }, box, 1);
  expect(file).not.toContain("<filter");
  expect(file.match(/<g id="frame-\d+"/g)).toHaveLength(PAPERCUT_SVG_FRAMES + 1);
  expect(file).toContain('<g id="frame-0" class="pca">');
  expect(file.match(/class="pcf" visibility="hidden"/g)).toHaveLength(PAPERCUT_SVG_FRAMES - 1);
  expect(file).toContain(`<g id="frame-${PAPERCUT_SVG_FRAMES}" class="pcz" visibility="hidden">`);
  expect(file).toContain(".pcf,.pcz,.pca{animation:180s linear infinite}");
  expect(file).toContain("prefers-reduced-motion");
  /* the last frame is the first again */
  const frame = (svg: string, f: number) =>
    new RegExp(`<g id="frame-${f}"[^>]*>(.*?)</g>(?=<g id=|</g></svg>)`).exec(svg)?.[1];
  expect(frame(file, PAPERCUT_SVG_FRAMES)).toBe(frame(file, 0));
  expect(frame(file, 1)).not.toBe(frame(file, 0));
  expect(fxMovingSvg("papercut", P, { angle: 120, shape: 7 }, box, 2)).toContain(
    ".pcf,.pcz,.pca{animation:90s linear infinite}"
  );
  const svg = effectSvg(P, SEED, fx, 120, box, "https://grabient.com");
  expect(svg).toMatch(/^<svg[^>]*width="640" height="320"/);
  expect(svg).toContain(`<!-- https://grabient.com/${SEED}?style=papercut&angle=120&shape=7 -->`);
  const css = effectStylesheet(P, SEED, fx, 120, "https://grabient.com");
  expect(css).toMatch(/50% 50% \/ cover no-repeat/);
  expect(effectColors(P, fx)).toHaveLength(12);
  expect(fxLoop("papercut", P, { angle: 90, shape: null })).toBe(180);
  expect(effectLinks("https://grabient.com", SEED, fx, 120, "/og").js).toBe(
    `https://grabient.com/${SEED}.js?style=papercut&angle=120&shape=7`
  );
  expect(effectEmbedHtml("https://grabient.com", SEED, fx, 120)).toContain(
    `<script src="https://grabient.com/${SEED}.js?style=papercut&amp;angle=120&amp;shape=7" async></script>`
  );
  const md = effectMarkdown(
    "https://grabient.com",
    SEED,
    fx,
    "/og"
  )(P, "Navy and teal", {
    angle: 120,
    colors: effectColors(P, fx)
  } as never);
  expect(md.called).toBe("Navy and teal papercut");
  expect(md.drawn).toContain("papercut, its sheets climbing toward 120 degrees, shape 7");
  expect(md.lead).toContain("Two tags play it behind any page.");
  /* its stylesheet steps the shadows the script draws soft, held for a reader who asks for less motion */
  expect(md.code).toContain(
    "the stylesheet paints the first frame in the page's first paint, its shadows stepped, and the script plays it from there with WebGL, its shadows soft. Without WebGL the first frame stays, and for a reader who asks for less motion the script holds its own."
  );
  expect(md.files).toHaveProperty("script");
});

test("the papercut's SVG finished: its drawing whole in a group, blurred over its gradient, its own blurs and clip kept, the grain's tiles over it", () => {
  /* held, the file with its own blurs and clip; moving, its frames as they are, inside the same finish */
  const fx: Effect = {
    kind: "papercut",
    speed: 0,
    fps: 60,
    look: { shape: 7, frost: 1, bg: null }
  };
  const box = { width: 400, height: 240 };
  const plain = effectSvg(P, SEED, fx, 120, box, "https://grabient.com");
  const svg = effectSvg(
    P,
    SEED,
    fx,
    120,
    box,
    "https://grabient.com",
    { soft: 40, grain: 30 },
    "data:image/png;base64,AAAA"
  );
  expect(svg).toMatch(
    new RegExp(
      `^<svg [^>]*><!-- https://grabient\\.com/${SEED}\\?style=papercut&angle=120&soft=40&grain=30&speed=0&shape=7 -->`
    )
  );
  expect(svg).toContain(
    `<filter id="gfx-soft" filterUnits="userSpaceOnUse" x="0" y="0" width="400" height="240" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${Number(effectBlurSigma(40, box).toFixed(3))}"/></filter>`
  );
  expect(svg).toContain(
    '<g clip-path="url(#gfx-box)"><rect width="400" height="240" fill="url(#gfx-under)"/><g filter="url(#gfx-soft)"><g clip-path="url(#gfx-box)"><g>'
  );
  /* the papercut's root names the box alone, so its drawing stands in a group, every byte of it as the plain file's:
     its shadows' blurs (pc0, pc1, ...) and its clip (pcbox) meet none of the finish's ids (gfx-) */
  const drawing = plain.slice(plain.indexOf("<defs>"), -"</svg>".length);
  expect(svg).toContain(
    `<g filter="url(#gfx-soft)"><g clip-path="url(#gfx-box)"><g>${drawing}</g></g></g>`
  );
  expect(drawing).toMatch(/<filter id="pc0" /);
  expect(drawing).toContain('clip-path="url(#pcbox)"');
  expect(drawing).not.toContain("gfx-");
  expect(svg).toContain(
    `<image id="gfx-grain" width="${box.width}" height="${box.height}" xlink:href="data:image/png;base64,AAAA"`
  );
  /* the soft alone has no grain; the grain alone no blur */
  const soft = effectSvg(P, SEED, fx, 120, box, "https://grabient.com", { soft: 40 });
  expect(soft).toContain("gfx-soft");
  expect(soft).not.toContain("gfx-grain");
  const grained = effectSvg(
    P,
    SEED,
    fx,
    120,
    box,
    "https://grabient.com",
    { grain: 30 },
    "data:image/png;base64,AAAA"
  );
  expect(grained).not.toContain("gfx-soft");
  expect(grained).toContain(`${drawing}`);
  /* moving, its frames and their animations inside the same finish */
  const moving = effectSvg(P, SEED, { ...fx, speed: 1 }, 120, box, "https://grabient.com", {
    soft: 40
  });
  expect(moving).toContain('<g filter="url(#gfx-soft)">');
  expect(moving).toContain("@keyframes pcf{");
  expect(moving).not.toContain('<filter id="pc0"');
});

test("a still drawn a step at a time is the still, the papercut's in a share of a millisecond or so a step", () => {
  const look = { angle: 200, shape: 640 };
  let steps = 0;
  const drawing = fxStillSteps("papercut", P, look);
  let step = drawing.next();
  while (!step.done) {
    steps++;
    step = drawing.next();
  }
  /* its scene, then the cuts' grid, their segments and each level's loops and curves */
  expect(steps).toBeGreaterThan(20);
  expect(step.value).toBe(fxStillBackground("papercut", P, look));
  /* the silk's and the rosette's in one */
  for (const kind of ["silk", "rosette"] as const) {
    const one = fxStillSteps(kind, P, look).next();
    expect(one.done).toBe(true);
    expect(one.value).toBe(fxStillBackground(kind, P, look));
  }
});
