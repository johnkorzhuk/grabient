import { expect, test } from "vitest";
import {
  blobStillKey,
  EFFECT_FPS,
  EMBED_PLAYING,
  effectAddressParts,
  effectEmbedHtml,
  effectFileAddress,
  effectLayerCss,
  groundHex,
  groundParts,
  parseEffect,
  readBlobStillKey
} from "./effect.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const effect = (query: string) => {
  const found = parseEffect(new URLSearchParams(query));
  if (!found) throw new Error(`no effect in ${query}`);
  return found;
};

test("an effect's address names its style, its angle off its default, its pace, its frames a second and its look", () => {
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
  // the blob turns with the angle too; its old depth and fill are no more
  expect(
    effectAddressParts(effect("style=blob&fill=1&depth=0&bg=%2310101480&shape=12&frost=0.5"), 135)
  ).toEqual(["style=blob", "angle=135", "frost=0.5", "shape=12", "bg=%2310101480"]);
  expect(effect("style=blob&bg=deep").look.bg).toBeNull();
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

test("a blob's still is named by its palette, its look and its angle, and read back", () => {
  const look = effect("style=blob&shape=7&bg=%2310101480&frost=0.5").look;
  const key = blobStillKey(SEED, look, 30);
  expect(key).toBe(`${SEED}|0.5|7|#10101480|30`);
  expect(readBlobStillKey(key)).toEqual({ seed: SEED, look, angle: 30 });
  expect(readBlobStillKey(`${SEED}|1|7||400`)).toBeNull();
  expect(readBlobStillKey(`${SEED}|1|7|`)).toBeNull();
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
  expect(glass).not.toContain(EMBED_PLAYING);
  expect(
    glass.endsWith(
      `</style>\n<script src="https://grabient.test/${SEED}.js?style=glass" async></script>`
    )
  ).toBe(true);
  const blob = effectEmbedHtml("https://grabient.test", SEED, effect("style=blob"), 90, "url(x)");
  expect(blob).toContain(`html[${EMBED_PLAYING}]::before {\n  background: none;\n}\n</style>`);
  expect(effectLayerCss("glass", "red")).toBe(
    'html::before {\n  content: "";\n  position: fixed;\n  inset: 0;\n  z-index: -1;\n  pointer-events: none;\n  background: red;\n}\n'
  );
});
