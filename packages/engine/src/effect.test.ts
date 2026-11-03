import { expect, test } from "vitest";
import {
  blobShapeOf,
  blobStillKey,
  EFFECT_FPS,
  EMBED_PLAYING,
  effectAddressParts,
  effectEmbedHtml,
  effectFileAddress,
  effectLayerCss,
  effectLook,
  effectStillParts,
  groundHex,
  groundParts,
  parseEffect,
  readBlobStillKey,
  SHAPE_MAX
} from "./effect.ts";
import { glassStillKey, readStillKey } from "./glass-colors.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const effect = (query: string) => {
  const found = parseEffect(new URLSearchParams(query));
  if (!found) throw new Error(`no effect in ${query}`);
  return found;
};

test("an effect's address names its style, the glass's angle off its default, its pace, its frames a second and its look", () => {
  expect(effectAddressParts(effect("style=glass"), 90)).toEqual(["style=glass"]);
  // 60 frames a second unless it says
  expect(effect("style=glass").fps).toBe(EFFECT_FPS.default);
  expect(effectAddressParts(effect("style=glass&speed=2.45&fps=60"), 135)).toEqual([
    "style=glass",
    "angle=135",
    "speed=2.45"
  ]);
  expect(effectAddressParts(effect("style=glass&fps=120&shape=12"), 90)).toEqual([
    "style=glass",
    "fps=120",
    "shape=12"
  ]);
  expect(effect("style=glass&fps=500").fps).toBe(120);
  expect(effect("style=glass&fps=0").fps).toBe(60);
  // the glass's shape 0 is the glass as designed, as none is
  expect(effect("style=glass&shape=0").look.shape).toBeNull();
  // the blob has no angle, its palette lying from left to right; its old depth and fill are no more
  expect(
    effectAddressParts(effect("style=blob&fill=1&depth=0&bg=%2310101480&shape=12&frost=0.5"), 135)
  ).toEqual(["style=blob", "frost=0.5", "shape=12", "bg=%2310101480"]);
  expect(effectStillParts(effect("style=blob&shape=12"), 135)).toEqual(["style=blob", "shape=12"]);
  expect(effect("style=blob&bg=deep").look.bg).toBeNull();
});

test("a shape is a number from 0 to 999 for both effects: a longer one is none, a stored one comes into bounds", () => {
  expect(SHAPE_MAX).toBe(999);
  for (const kind of ["glass", "blob"]) {
    expect(effect(`style=${kind}&shape=999`).look.shape).toBe(999);
    // never folded into another shape, which would give one picture two addresses
    expect(effect(`style=${kind}&shape=1000`).look.shape).toBeNull();
    expect(effect(`style=${kind}&shape=0999`).look.shape).toBeNull();
  }
  expect(effectLook({ shape: 3857 }).shape).toBe(999);
  expect(effectLook({ shape: -3 }).shape).toBe(0);
  // a still is named for a shape in bounds, as a page writes it
  expect(readBlobStillKey(`${SEED}|1|999|`)?.look.shape).toBe(999);
  expect(readBlobStillKey(`${SEED}|1|1000|`)).toBeNull();
  expect(readStillKey(glassStillKey(["#000000", "#ffffff"], 90, 999))?.shape).toBe(999);
  expect(readStillKey("90|1000|#000000,#ffffff")).toBeNull();
});

test("a palette suggests its blob a shape from 0 to 999, the same each time", () => {
  for (let i = 0; i < 2000; i++) {
    const shape = blobShapeOf(`k${i.toString(36)}`);
    expect(Number.isInteger(shape) && shape >= 0 && shape <= SHAPE_MAX).toBe(true);
  }
  // the last three digits of 9051, its suggestion while there were 10,000 shapes
  expect(blobShapeOf(SEED)).toBe(51);
});

test("a ground is hex, its alpha kept where it lets something through", () => {
  expect(groundHex("FFF")).toBe("#ffffff");
  expect(groundHex("#ff000080")).toBe("#ff000080");
  expect(groundHex("f008")).toBe("#ff000088");
  expect(groundHex("#123456ff")).toBe("#123456");
  expect(groundHex("#12345600")).toBeNull();
  expect(groundHex("red")).toBeNull();
  expect(groundHex(" #ABCDEF ")).toBe("#abcdef");
  expect(groundParts("#ff000080")).toEqual({ hex: "#ff0000", alpha: 128 / 255 });
  expect(groundParts("#ff0000")).toEqual({ hex: "#ff0000", alpha: 1 });
});

test("a blob's still is named by its palette and its look, and read back", () => {
  const look = effect("style=blob&shape=7&bg=%2310101480&frost=0.5").look;
  const key = blobStillKey(SEED, look);
  expect(key).toBe(`${SEED}|0.5|7|#10101480`);
  expect(readBlobStillKey(key)).toEqual({ seed: SEED, look });
  expect(readBlobStillKey(`${SEED}|1|7|`)).toEqual({
    seed: SEED,
    look: { frost: 1, shape: 7, bg: null }
  });
  // a name that ends in an angle, as names did, names nothing
  expect(readBlobStillKey(`${SEED}|1|7||90`)).toBeNull();
  expect(readBlobStillKey(`${SEED}|1|7`)).toBeNull();
});

test("an effect's file is named by the same address, its pictures at the size asked", () => {
  const glass = effect("style=glass&speed=2.45");
  expect(effectFileAddress("https://grabient.test", SEED, glass, 135, "js")).toBe(
    `https://grabient.test/${SEED}.js?style=glass&angle=135&speed=2.45`
  );
  expect(
    effectFileAddress("https://grabient.test", SEED, glass, 90, "png", {
      width: 1080,
      height: 1080
    })
  ).toBe(`https://grabient.test/${SEED}.png?style=glass&speed=2.45&w=1080&h=1080`);
  // a stylesheet and a script take no size
  expect(
    effectFileAddress("https://grabient.test", SEED, glass, 90, "css", { width: 10, height: 10 })
  ).toBe(`https://grabient.test/${SEED}.css?style=glass&speed=2.45`);
  expect(
    effectFileAddress("https://grabient.test", SEED, effect("style=blob&bg=%23101014"), 90, "svg")
  ).toBe(`https://grabient.test/${SEED}.svg?style=blob&bg=%23101014`);
});

test("the tags that play an effect behind a page are its stylesheet and its script, one address, as HTML", () => {
  expect(effectEmbedHtml("https://grabient.test", SEED, effect("style=glass&speed=2"), 135)).toBe(
    `<link rel="stylesheet" href="https://grabient.test/${SEED}.css?style=glass&amp;angle=135&amp;speed=2">\n` +
      `<script src="https://grabient.test/${SEED}.js?style=glass&amp;angle=135&amp;speed=2" async></script>`
  );
});

test("with its still, the tags hold the first frame in the page itself, and the blob's gives it up as it plays", () => {
  const glass = effectEmbedHtml(
    "https://grabient.test",
    SEED,
    effect("style=glass"),
    90,
    'url("data:image/webp;base64,AAAA") 50% 50%/cover no-repeat'
  );
  expect(glass.startsWith("<style>\nhtml::before {\n")).toBe(true);
  expect(glass).toContain(
    'background: url("data:image/webp;base64,AAAA") 50% 50%/cover no-repeat;'
  );
  expect(glass).not.toContain("<link");
  // the glass's canvas, opaque once faded in, takes the still's place too
  expect(glass).toContain(`html[${EMBED_PLAYING}]::before {\n  background: none;\n}\n</style>`);
  expect(
    glass.endsWith(
      `</style>\n<script src="https://grabient.test/${SEED}.js?style=glass" async></script>`
    )
  ).toBe(true);
  const blob = effectEmbedHtml("https://grabient.test", SEED, effect("style=blob"), 90, "url(x)");
  expect(blob).toContain(`html[${EMBED_PLAYING}]::before {\n  background: none;\n}\n</style>`);
  expect(effectLayerCss("red")).toBe(
    `html::before {\n  content: "";\n  position: fixed;\n  inset: 0;\n  z-index: -1;\n  pointer-events: none;\n  background: red;\n}\nhtml[${EMBED_PLAYING}]::before {\n  background: none;\n}\n`
  );
});

test("a soft and grained view's tags finish the still inside the page and name both in the script's address", () => {
  const html = effectEmbedHtml(
    "https://grabient.test",
    SEED,
    effect("style=rosette"),
    90,
    "url(x)",
    { soft: 40, grain: 20 },
    { blur: "blur(1vmax)", under: "linear-gradient(red, blue)", grain: "url(y) 0 0 / 128px 128px" }
  );
  // the still blurred over its gradient, the grain on a layer of its own over both
  expect(html).toContain("  background: url(x);\n  filter: blur(1vmax);\n}");
  expect(html).toMatch(
    /html::after \{[^}]*z-index: -2;[^}]*background: linear-gradient\(red, blue\);/
  );
  expect(html).toMatch(
    /body::before \{[^}]*background: url\(y\) 0 0 \/ 128px 128px;\n {2}image-rendering: pixelated;/
  );
  expect(html).toContain(
    `<script src="https://grabient.test/${SEED}.js?style=rosette&amp;soft=40&amp;grain=20" async></script>`
  );
  // a grain alone lays no gradient and no blur
  const grained = effectLayerCss("url(x)", { grain: "url(y) 0 0 / 128px 128px" });
  expect(grained).not.toMatch(/filter|html::after/);
  expect(grained).toContain(`html[${EMBED_PLAYING}] body::before {\n  background: none;\n}`);
});
