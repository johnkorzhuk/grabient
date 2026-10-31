import { decodePalette } from "@grabient/engine/codec.ts";
import { parseEffect } from "@grabient/engine/effect.ts";
import { glassStillBackground } from "@grabient/engine/glass.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import { expect, test } from "vitest";
import { EMBED_PLAYING, effectCss, effectStill } from "./effect-files.ts";

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

test("the blob's stylesheet draws its look, and gives the still up once the script's canvas shows", () => {
  if (!P) throw new Error("no palette");
  const css = effectCss(P, effect("style=blob&fill=1&bg=deep"), 90, "c");
  expect(css).toContain(`background: ${effectStill(P, effect("style=blob&fill=1&bg=deep"), 90)};`);
  expect(css).toContain(`html[${EMBED_PLAYING}]::before {\n  background-image: none;\n}`);
  expect(effectStill(P, effect("style=blob&shape=3"), 90)).not.toBe(
    effectStill(P, effect("style=blob&shape=4"), 90)
  );
});
