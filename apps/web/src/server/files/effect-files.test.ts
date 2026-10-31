import { decodePalette } from "@grabient/engine/codec.ts";
import { EMBED_PLAYING, parseEffect } from "@grabient/engine/effect.ts";
import { glassStillBackground } from "@grabient/engine/glass.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import { expect, test } from "vitest";
import { effectCss, effectStill } from "./effect-files.ts";

const SEED = "kWTATrcQ7MeMxv1MwbbLKq84";
const P = decodePalette(SEED);
const effect = (query: string) => {
  const found = parseEffect(new URLSearchParams(query));
  if (!found) throw new Error(`no effect in ${query}`);
  return found;
};

test("the glass's stylesheet paints the still the palette's page paints, on a layer fixed behind the page", () => {
  if (!P) throw new Error("no palette");
  const css = effectCss(P, effect("style=glass"), 135, "https://grabient.test/x");
  expect(css.startsWith("/* https://grabient.test/x */\nhtml::before {")).toBe(true);
  expect(css).toContain(`background: ${glassStillBackground(glassColors(P), 135)};`);
  expect(css).toContain("pointer-events: none;");
  expect(css).not.toContain(EMBED_PLAYING);
});

test("the blob's stylesheet draws its look, and gives the still and its ground up once the script's canvas shows", () => {
  if (!P) throw new Error("no palette");
  const css = effectCss(P, effect("style=blob&bg=%2310101480"), 90, "c");
  expect(css).toContain(`background: ${effectStill(P, effect("style=blob&bg=%2310101480"), 90)};`);
  // the canvas draws the ground itself: a ground that lets the page through is painted once
  expect(css).toContain(`html[${EMBED_PLAYING}]::before {\n  background: none;\n}`);
  expect(effectStill(P, effect("style=blob&shape=3"), 90)).not.toBe(
    effectStill(P, effect("style=blob&shape=4"), 90)
  );
  // the angle lays the palette across the blobs
  expect(effectStill(P, effect("style=blob&shape=3"), 90)).not.toBe(
    effectStill(P, effect("style=blob&shape=3"), 180)
  );
});

test("the glass's shape draws a still of its own", () => {
  if (!P) throw new Error("no palette");
  expect(effectStill(P, effect("style=glass&shape=12"), 90)).toBe(
    glassStillBackground(glassColors(P), 90, 12)
  );
  expect(effectStill(P, effect("style=glass&shape=12"), 90)).not.toBe(
    effectStill(P, effect("style=glass"), 90)
  );
});
