import { EFFECTS, parseEffect } from "@grabient/engine/effect.ts";
import { expect, test } from "vitest";
import {
  effectCopyFormats,
  effectLinkFormats,
  STRIP_COPY,
  STRIP_EFFECT_COPY,
  STRIP_EFFECT_LINKS,
  STRIP_FILES
} from "../editor/formats.ts";
import { cardTakings } from "./take.ts";

/* take.ts keeps its own copy of the editor's strip formats, so a list's start carries none of formats.ts: in a module
   of their own the lists cost each list's start a chunk more (~130 bytes gzipped), and in lib/files.ts, which every
   page with a strip loads, 13 to 33 bytes more than the two copies (1 Nov 2026). This holds the copies alike. */

const card = (effect: string | null) =>
  cardTakings({
    palette: () => ({
      seed: "kWTATrcQ7MeMxv1MwbbLKq84",
      style: "linearGradient",
      steps: 6,
      angle: 90
    }),
    played: () =>
      effect ? { effect: parseEffect(new URLSearchParams(`style=${effect}`))!, size: null } : null,
    place: () => ({ surface: "list" }),
    at: () => ({}),
    say: () => {}
  });

test("a card's strip offers the formats the editor's strips offer, with an effect playing and without", () => {
  expect(card(null).chips()).toEqual({
    copy: STRIP_COPY,
    download: STRIP_FILES,
    link: STRIP_FILES
  });
  /* every effect, on a card as in the editor: its script where one plays it, and Copy for Figma where Figma's
     timeline plays its layers, the others' SVG going into Figma in its place */
  for (const effect of EFFECTS)
    expect(card(effect).chips(), effect).toEqual({
      copy: effectCopyFormats(effect),
      download: STRIP_FILES,
      link: effectLinkFormats(effect)
    });
  for (const effect of ["glass", "blob", "silk", "rosette"] as const)
    expect(effectCopyFormats(effect)).toEqual(STRIP_EFFECT_COPY);
  for (const effect of ["papercut", "strings", "strata"] as const) {
    expect(effectCopyFormats(effect)).toEqual(STRIP_EFFECT_COPY.filter(f => f !== "figma"));
    expect(effectCopyFormats(effect)).toContain("svg");
  }
  expect(effectLinkFormats("silk")).toEqual(STRIP_EFFECT_LINKS);
});
