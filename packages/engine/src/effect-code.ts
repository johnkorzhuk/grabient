/* An effect's code as Grabient hands it over, written once for the Worker's files (apps/web/src/server/files) and for
   the editor's copies and code pane, so a copy says what the effect's address serves: the stylesheet that paints its
   first frame behind a page, its SVG, the colors it draws and its settings beside the palette's keyframes. It holds
   both effects' drawings, so a page loads it with the first effect it hands over. */
import { BLOB_DESIGN, BLOB_SIZE, blobScene, blobStillBackground, blobSvg } from "./blob.ts";
import {
  type Effect,
  effectAddressParts,
  effectLayerCss,
  effectSettings,
  effectStillParts
} from "./effect.ts";
import { glassDesign, glassField, glassStillBackground, glassSvg } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import type { Palette } from "./palette.ts";
import { toSpec } from "./spec.ts";
import { DEFAULT_SIZE, type Size } from "./view.ts";

/** The effect's page, named by all its first frame depends on (its style, angle and look) or, `paced`, by how it plays
    too: what a file of it credits. */
export const effectPage = (
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  paced = false
): string =>
  `${origin.replace(/\/$/, "")}/${seed}?${(paced ? effectAddressParts(effect, angle) : effectStillParts(effect, angle)).join("&")}`;

/** The effect's first frame as a background covering its box, all it depends on named: the glass's colors, angle and
    shape, the blob's look and angle. */
export const effectStill = (P: Palette, effect: Effect, angle: number): string =>
  effect.kind === "glass"
    ? glassStillBackground(glassColors(P), angle, effect.look.shape)
    : blobStillBackground(P, { speed: 1, fps: null, still: true, angle, ...effect.look });

/** The stylesheet at /{seed}.css?style=glass or blob: the still on a layer fixed behind the page (effectLayerCss),
    credited to the effect's page as its still is drawn, which is all the file depends on. */
export const effectStylesheet = (
  P: Palette,
  seed: string,
  effect: Effect,
  angle: number,
  origin: string
): string =>
  `/* ${effectPage(origin, seed, effect, angle)} */\n${effectLayerCss(effect.kind, effectStill(P, effect, angle))}`;

/** The size an effect's SVG is drawn at where none is asked. */
export const effectSize = (effect: Effect): Size =>
  effect.kind === "blob" ? BLOB_SIZE : DEFAULT_SIZE;

/* a comment can hold no double hyphen, which a seed may */
const comment = (credit: string) => `<!-- ${credit.replace(/--/g, "-%2D")} -->`;

/** The effect as an SVG moved by CSS alone, covering its box (effectSize where none is given), credited to the
    effect's page; at speed 0, its first frame. */
export function effectSvg(
  P: Palette,
  seed: string,
  effect: Effect,
  angle: number,
  size: Size | null,
  origin: string
): string {
  const box = size ?? effectSize(effect);
  const credit = effectPage(origin, seed, effect, angle, true);
  const still = effect.speed === 0;
  const speed = effect.speed || 1;
  if (effect.kind === "blob")
    return blobSvg(P, { ...effect.look, speed, fps: effect.fps, still, angle }, box, credit);
  const design = glassDesign(angle, effect.look.shape);
  return glassSvg(design, glassField(design, glassColors(P)), { still, speed, cover: true })
    .replace('width="100%" height="100%"', `width="${box.width}" height="${box.height}"`)
    .replace(/^<svg[^>]*>/, open => `${open}${comment(credit)}`);
}

/** The colors the effect draws, along the palette from its first: the glass's six behind its ribs, and the colors
    the blob's balls are painted in, each once. */
export function effectColors(P: Palette, effect: Effect, angle: number): string[] {
  if (effect.kind === "glass") return glassColors(P);
  const scene = blobScene(P, BLOB_DESIGN, { ...effect.look, angle });
  const along = [...new Set(scene.blobs.flatMap(blob => blob.balls.map(ball => ball.at)))];
  return [...new Set(along.sort((a, b) => a - b).map(scene.color))];
}

/** The palette's keyframes and the effect's settings as JSON, each named as its address names it: the glass's shape 0
    is the glass as designed, and a blob with no shape is the one the palette's own numbers draw. */
export const effectSpecJson = (P: Palette, effect: Effect, angle: number): string =>
  JSON.stringify({ ...toSpec(P), ...effectSettings(effect, angle) }, null, 2);
