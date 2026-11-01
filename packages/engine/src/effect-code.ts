/* An effect's code as Grabient hands it over, written once for the Worker's files (apps/web/src/server/files) and for
   the editor's copies and code pane, so a copy says what the effect's address serves: the stylesheet that paints its
   first frame behind a page, its SVG, the colors it draws, its settings beside the palette's keyframes, and what the
   palette's Markdown and JSON say of it. It holds both effects' drawings, so a page or an isolate loads it with the
   first effect it hands over, never at its start. */
import { BLOB_DESIGN, BLOB_SIZE, blobScene, blobStillBackground, blobSvg } from "./blob.ts";
import {
  type Effect,
  effectAddressParts,
  effectEmbedHtml,
  effectFileAddress,
  effectLayerCss,
  effectStillParts
} from "./effect.ts";
import { glassDesign, glassField, glassStillBackground, glassSvg } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import type { MarkdownEffect } from "./markdown.ts";
import type { Palette } from "./palette.ts";
import { toSpec } from "./spec.ts";
import { svgComment } from "./svg.ts";
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
    .replace(/^<svg[^>]*>/, open => `${open}${svgComment(credit)}`);
}

/** The colors the effect draws, along the palette from its first: the glass's six behind its ribs, and the colors
    the blob's balls are painted in, each once. */
export function effectColors(P: Palette, effect: Effect, angle: number): string[] {
  if (effect.kind === "glass") return glassColors(P);
  const scene = blobScene(P, BLOB_DESIGN, { ...effect.look, angle });
  const along = [...new Set(scene.blobs.flatMap(blob => blob.balls.map(ball => ball.at)))];
  return [...new Set(along.sort((a, b) => a - b).map(scene.color))];
}

/** An effect's settings as its address names them, defaults written out: the glass's shape 0 is the glass as designed,
    and a blob's null shape the one its palette's own numbers draw. */
function effectSettings(effect: Effect, angle: number) {
  const { kind, speed, fps, look } = effect;
  return kind === "glass"
    ? { style: kind, angle, speed, fps, shape: look.shape ?? 0 }
    : { style: kind, angle, speed, fps, shape: look.shape, frost: look.frost, bg: look.bg };
}

/** The palette's keyframes and the effect's settings as JSON. */
export const effectSpecJson = (P: Palette, effect: Effect, angle: number): string =>
  JSON.stringify({ ...toSpec(P), ...effectSettings(effect, angle) }, null, 2);

/** The addresses an effect goes by, as a palette's document names its own files: its page, how it plays included, the
    stylesheet of its first frame, the script that plays it, its moving SVG, its first frame as PNG, and its share
    card, the address its page names (apps/web/src/lib/page-meta.ts effectCard). */
export function effectLinks(
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  card: string
) {
  const base = origin.replace(/\/$/, "");
  const at = (extension: "css" | "js" | "svg" | "png") =>
    effectFileAddress(base, seed, effect, angle, extension);
  return {
    page: effectPage(base, seed, effect, angle, true),
    css: at("css"),
    js: at("js"),
    svg: at("svg"),
    png: at("png"),
    og: card
  };
}

/** The effect in its palette's JSON at the effect's address: its settings, the colors it draws, the tags that play it
    behind a page, and its own files. */
export const effectDocument = (
  P: Palette,
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  card: string
) => ({
  ...effectSettings(effect, angle),
  colors: effectColors(P, effect, angle),
  html: effectEmbedHtml(origin.replace(/\/$/, ""), seed, effect, angle),
  links: effectLinks(origin, seed, effect, angle, card)
});

/** What the palette's Markdown says at the effect's address in a gradient's place: a title naming the effect, a lead,
    how it is drawn and plays, the tags that play it behind a page, and its own files. English, as the file is. */
export const effectMarkdown =
  (origin: string, seed: string, effect: Effect, card: string): MarkdownEffect =>
  (P, name, doc) => {
    const angle = doc.angle;
    const { shape, frost, bg } = effect.look;
    const { js, ...links } = effectLinks(origin, seed, effect, angle, card);
    const play =
      effect.speed === 0
        ? "held on its first frame"
        : `speed ${effect.speed}, up to ${effect.fps} frames a second`;
    const glass = effect.kind === "glass";
    return {
      called: `${name} ${glass ? "fluted glass" : "blob"}`,
      lead: glass
        ? `${name} played as fluted glass: its colors ${glassColors(P).join(", ")} drift behind ribbed glass. Two tags play it behind any page.`
        : `${name} played as a frosted blob: the palette's colors ${doc.colors.join(", ")} melt into one another as it drifts. Two tags play it behind any page.`,
      drawn: glass
        ? `fluted glass, its ribs at ${angle} degrees, shape ${shape ?? 0}, ${play}`
        : `a blob, the palette across it at ${angle} degrees${shape === null ? "" : `, shape ${shape}`}, frost ${frost}, ${bg ? `on ${bg}` : "on no ground"}, ${play}`,
      code: `## Behind a page

In the page's head, the stylesheet paints the first frame in the page's first paint, and the script plays it from there with WebGL. Without WebGL, or for a reader who asks for less motion, the first frame stays.

\`\`\`html
${effectEmbedHtml(origin.replace(/\/$/, ""), seed, effect, angle)}
\`\`\``,
      files: {
        ...links,
        json: effectFileAddress(origin.replace(/\/$/, ""), seed, effect, angle, "json"),
        script: js
      }
    };
  };
