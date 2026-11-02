import { expect, test } from "vitest";
import { decodePalette } from "./codec.ts";
import { EMBED_PLAYING, effectEmbedHtml, effectFileAddress, parseEffect } from "./effect.ts";
import {
  effectColors,
  effectDocument,
  effectMarkdown,
  effectPage,
  effectSpecJson,
  effectStill,
  effectStylesheet,
  effectSvg
} from "./effect-code.ts";
import { glassStillBackground } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import { paletteMarkdown } from "./markdown.ts";
import { fromSpec } from "./spec.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const P = decodePalette(SEED)!;
const ORIGIN = "https://grabient.test";
const effect = (query: string) => {
  const found = parseEffect(new URLSearchParams(query));
  if (!found) throw new Error(`no effect in ${query}`);
  return found;
};

test("the glass's stylesheet paints the still the palette's page paints, on a layer fixed behind the page", () => {
  const css = effectStylesheet(P, SEED, effect("style=glass"), 135, ORIGIN);
  expect(css.startsWith(`/* ${ORIGIN}/${SEED}?style=glass&angle=135 */\nhtml::before {`)).toBe(
    true
  );
  expect(css).toContain(`background: ${glassStillBackground(glassColors(P), 135)};`);
  expect(css).toContain("position: fixed;");
  expect(css).toContain("pointer-events: none;");
  // the still goes once the glass's canvas, opaque, has faded in over it
  expect(css).toContain(`html[${EMBED_PLAYING}]::before {\n  background: none;\n}`);
});

test("the blob's stylesheet draws its look, and gives the still up once the script's canvas shows", () => {
  const blob = effect("style=blob&bg=%2310101480");
  const css = effectStylesheet(P, SEED, blob, 90, ORIGIN);
  expect(css).toContain(`background: ${effectStill(P, blob, 90)};`);
  // the canvas draws the ground itself: a ground that lets the page through is painted once
  expect(css).toContain(`html[${EMBED_PLAYING}]::before {\n  background: none;\n}`);
  expect(effectStill(P, effect("style=blob&shape=3"), 90)).not.toBe(
    effectStill(P, effect("style=blob&shape=4"), 90)
  );
  // the blob has no angle: its palette lies from left to right whatever the view's
  expect(effectStill(P, effect("style=blob&shape=3"), 90)).toBe(
    effectStill(P, effect("style=blob&shape=3"), 180)
  );
});

test("a stylesheet credits the effect's page by all its still depends on, the glass's angle, never its pace", () => {
  const credit = (query: string, angle: number) =>
    effectStylesheet(P, SEED, effect(query), angle, ORIGIN).split("\n")[0];
  // the blob has no angle
  expect(credit("style=blob&shape=3&frost=0.5&speed=2&fps=30", 45)).toBe(
    `/* ${ORIGIN}/${SEED}?style=blob&frost=0.5&shape=3 */`
  );
  expect(credit("style=glass&shape=12&speed=0", 160)).toBe(
    `/* ${ORIGIN}/${SEED}?style=glass&angle=160&shape=12 */`
  );
  expect(credit("style=glass", 90)).toBe(`/* ${ORIGIN}/${SEED}?style=glass */`);
  // its SVG moves, so it names the pace too
  expect(effectPage(ORIGIN, SEED, effect("style=glass&speed=2"), 90, true)).toBe(
    `${ORIGIN}/${SEED}?style=glass&speed=2`
  );
});

test("the glass's shape draws a still of its own", () => {
  expect(effectStill(P, effect("style=glass&shape=12"), 90)).toBe(
    glassStillBackground(glassColors(P), 90, 12)
  );
  expect(effectStill(P, effect("style=glass&shape=12"), 90)).not.toBe(
    effectStill(P, effect("style=glass"), 90)
  );
});

test("an effect's SVG moves while it plays and holds its first frame at speed 0, at its size, credited", () => {
  for (const kind of ["glass", "blob"]) {
    const moving = effectSvg(P, SEED, effect(`style=${kind}&speed=2`), 45, null, ORIGIN);
    const still = effectSvg(P, SEED, effect(`style=${kind}&speed=0`), 45, null, ORIGIN);
    expect(moving).toContain("@keyframes");
    expect(still).not.toContain("@keyframes");
    expect(moving).toContain(
      `<!-- ${ORIGIN}/${SEED}?style=${kind}${kind === "glass" ? "&angle=45" : ""}&speed=2 -->`
    );
    const sized = effectSvg(
      P,
      SEED,
      effect(`style=${kind}`),
      90,
      { width: 640, height: 360 },
      ORIGIN
    );
    expect(sized).toMatch(/^<svg [^>]*width="640" height="360"/);
  }
  expect(effectSvg(P, SEED, effect("style=glass"), 90, null, ORIGIN)).toMatch(
    /^<svg [^>]*width="800" height="400"/
  );
  expect(effectSvg(P, SEED, effect("style=blob"), 90, null, ORIGIN)).toMatch(
    /^<svg [^>]*width="500" height="500"/
  );
});

test("an effect's colors are the ones it draws, along the palette", () => {
  expect(effectColors(P, effect("style=glass"))).toEqual(glassColors(P));
  const blob = effectColors(P, effect("style=blob&shape=3"));
  expect(blob.length).toBeGreaterThan(6);
  expect(new Set(blob).size).toBe(blob.length);
  for (const hex of blob) expect(hex).toMatch(/^#[0-9a-f]{6}$/);
  // another shape lays other colors on the balls
  expect(effectColors(P, effect("style=blob&shape=4"))).not.toEqual(blob);
});

test("an effect's JSON holds the keyframes and how it plays, as its address names them", () => {
  const glass = JSON.parse(effectSpecJson(P, effect("style=glass&speed=0.5"), 45));
  expect(fromSpec(glass)).toEqual(P);
  expect(glass).toMatchObject({ style: "glass", angle: 45, speed: 0.5, fps: 60, shape: 0 });
  expect(glass).not.toHaveProperty("frost");
  const blob = JSON.parse(effectSpecJson(P, effect("style=blob&frost=2&bg=%23101014&shape=9"), 45));
  expect(blob).toMatchObject({ style: "blob", shape: 9, frost: 2, bg: "#101014" });
  // the blob has no angle
  expect(blob).not.toHaveProperty("angle");
});

test("the palette's JSON at an effect's address names the effect: its settings, its colors, its tags and its files", () => {
  const glass = effect("style=glass&speed=0&shape=4");
  const card = `${ORIGIN}/api/og?seed=${SEED}&v=k4&style=glass&angle=30&shape=4`;
  expect(effectDocument(P, ORIGIN, SEED, glass, 30, card)).toEqual({
    style: "glass",
    angle: 30,
    speed: 0,
    fps: 60,
    shape: 4,
    colors: glassColors(P),
    html: effectEmbedHtml(ORIGIN, SEED, glass, 30),
    links: {
      page: `${ORIGIN}/${SEED}?style=glass&angle=30&speed=0&shape=4`,
      css: effectFileAddress(ORIGIN, SEED, glass, 30, "css"),
      js: effectFileAddress(ORIGIN, SEED, glass, 30, "js"),
      svg: effectFileAddress(ORIGIN, SEED, glass, 30, "svg"),
      png: effectFileAddress(ORIGIN, SEED, glass, 30, "png"),
      og: card
    }
  });
  const blob = effect("style=blob&frost=2");
  expect(effectDocument(P, ORIGIN, SEED, blob, 90, card)).toMatchObject({
    style: "blob",
    shape: null,
    frost: 2,
    bg: null,
    colors: effectColors(P, blob)
  });
});

test("the palette's Markdown at an effect's address says what plays and how, and the tags in the CSS's place", () => {
  const text = paletteMarkdown(
    SEED,
    ORIGIN,
    { angle: 45 },
    null,
    [],
    null,
    effectMarkdown(
      ORIGIN,
      SEED,
      effect("style=blob&speed=0&bg=%23101014"),
      `${ORIGIN}/api/og?seed=${SEED}&v=k4&style=blob&bg=%23101014`
    )
  )!;
  expect(text).toMatch(/^# .+ blob\n/);
  expect(text).toContain(
    "- Drawn as: a blob, the palette across it from left to right, frost 1, on #101014, held on its first frame"
  );
  expect(text).toContain("## Behind a page");
  expect(text).not.toContain("## CSS");
  expect(text).toContain(`- [Script](${ORIGIN}/${SEED}.js?style=blob&speed=0&bg=%23101014)`);
  expect(text).toContain(
    `- [Social card](${ORIGIN}/api/og?seed=${SEED}&v=k4&style=blob&bg=%23101014)`
  );
  // the gradient's Markdown is as it was, with no script among its forms
  const gradient = paletteMarkdown(SEED, ORIGIN, { angle: 45 }, null, [])!;
  expect(gradient).toContain("## CSS");
  expect(gradient).not.toContain("- [Script]");
});
