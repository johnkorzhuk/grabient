/* An effect's code as Grabient hands it over, written once for the Worker's files (apps/web/src/server/files) and for
   the editor's copies and code pane, so a copy says what the effect's address serves: the stylesheet that paints its
   first frame behind a page, its SVG, the colors it draws, its settings beside the palette's keyframes, and what the
   palette's Markdown and JSON say of it. It holds both effects' drawings, so a page or an isolate loads it with the
   first effect it hands over, never at its start. */
import { BLOB_DESIGN, BLOB_SIZE, blobScene, blobStillBackground, blobSvg } from "./blob.ts";
import { gradientCss } from "./css.ts";
import { sampleStops } from "./curve.ts";
import {
  type Effect,
  type EffectFinish,
  type EffectKind,
  effectAddressParts,
  effectFileAddress,
  effectStillParts,
  hasEmbedScript,
  isVectorKind
} from "./effect.ts";
import { type EffectLayers, effectEmbedHtml, effectLayerCss } from "./effect-embed.ts";
import { effectUnderlay, finishOf, finishSvg } from "./fx-finish.ts";
import { fxMovingSvg, fxStillBackground } from "./fx-still.ts";
import { glassDesign, glassField, glassStillBackground, glassSvg } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import { GRAIN_SIDE } from "./grain.ts";
import type { MarkdownEffect } from "./markdown.ts";
import type { Palette } from "./palette.ts";
import { PAPERCUT_LOOK } from "./papercut.ts";
import { toSpec } from "./spec.ts";
import { svgComment } from "./svg-comment.ts";
import { DEFAULT_SIZE, effectSoftShare, type Size } from "./view.ts";

/** The effect's page, named by all its first frame depends on (its style, the glass's angle, the soft and the grain,
    and its look) or, `paced`, by how it plays too: what a file of it credits. */
export const effectPage = (
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  paced = false,
  finish: EffectFinish = {}
): string =>
  `${origin.replace(/\/$/, "")}/${seed}?${(paced ? effectAddressParts(effect, angle, finish) : effectStillParts(effect, angle, finish)).join("&")}`;

/** The effect's first frame as a background covering its box, all it depends on named: the glass's colors, angle and
    shape, the blob's look. */
export const effectStill = (P: Palette, effect: Effect, angle: number): string =>
  effect.kind === "glass"
    ? glassStillBackground(glassColors(P), angle, effect.look.shape)
    : isVectorKind(effect.kind)
      ? fxStillBackground(effect.kind, P, { angle, shape: effect.look.shape })
      : blobStillBackground(P, { speed: 1, fps: null, still: true, ...effect.look });

/** What the view's soft and grain lay with the effect's still behind a page (effect-embed.ts effectLayerCss), as the
    site's stage finishes its picture (fx-finish.ts): the still blurred by a share of the page's longer side, in `vmax`
    as the stage's blur is in its box's `cqmax`, over its palette's gradient at the effect's angle, its stops blurred
    by the same soft (none under a blob whose ground lets the page through, or that has none, whose edges go clear to
    the page as it shows through without the soft), and the grain's tile over both at one speck a CSS pixel, `grain`
    the tile at the view's grain as a CSS image (`url("data:…")`, the Worker's or the editor's own, engine/grain.ts
    grainPng). */
export function effectLayers(
  P: Palette,
  effect: Effect,
  angle: number,
  finish: EffectFinish = {},
  grain?: string | null
): EffectLayers {
  const { soft, grain: grained } = finishOf(finish);
  const underlay = soft ? effectUnderlay(P, effect, angle, soft) : null;
  return {
    ...(soft ? { blur: `blur(${(effectSoftShare(soft) * 100).toFixed(3)}vmax)` } : {}),
    ...(underlay
      ? {
          under: gradientCss(
            underlay.stops.map(s => s.hex),
            underlay.style,
            underlay.angle,
            undefined,
            underlay.at
          )
        }
      : {}),
    ...(grained && grain ? { grain: `${grain} 0 0 / ${GRAIN_SIDE}px ${GRAIN_SIDE}px` } : {})
  };
}

/** The stylesheet at /{seed}.css?style=: the still on a layer fixed behind the page (effectLayerCss), finished by the
    view's soft and grain (effectLayers), credited to the effect's page as its still is drawn, which is all the file
    depends on. */
export const effectStylesheet = (
  P: Palette,
  seed: string,
  effect: Effect,
  angle: number,
  origin: string,
  finish: EffectFinish = {},
  grain?: string | null
): string =>
  `/* ${effectPage(origin, seed, effect, angle, false, finish)} */\n${effectLayerCss(
    effectStill(P, effect, angle),
    effectLayers(P, effect, angle, finish, grain)
  )}`;

/** The size an effect's SVG is drawn at where none is asked. */
export const effectSize = (effect: Effect): Size =>
  effect.kind === "blob" ? BLOB_SIZE : DEFAULT_SIZE;

/** How each effect's SVG moves at a speed: by CSS animations (the papercut's by its stills fading one into the next,
    since its cuts change shape as they move), or by SMIL (the silk's rings). */
export const EFFECT_SVG_MOTION: Readonly<Record<EffectKind, "css" | "smil">> = {
  glass: "css",
  blob: "css",
  silk: "smil",
  rosette: "css",
  papercut: "css"
};

/** The effect as an SVG moved by CSS or SMIL alone (EFFECT_SVG_MOTION), covering its box (effectSize where none is
    given), credited to the effect's page; at speed 0, its first frame. A soft or grained view's SVG is finished as the site paints it
    (fx-finish.ts finishSvg): its drawing blurred over its palette's gradient, and the grain's tile over it, `grain` the
    tile's data URI at the view's grain (the Worker's and the editor's own, engine/grain.ts grainPng). */
export function effectSvg(
  P: Palette,
  seed: string,
  effect: Effect,
  angle: number,
  size: Size | null,
  origin: string,
  finish: EffectFinish = {},
  grain?: string | null
): string {
  const box = size ?? effectSize(effect);
  const credit = effectPage(origin, seed, effect, angle, true, finish);
  const still = effect.speed === 0;
  const speed = effect.speed || 1;
  const drawn = (() => {
    if (effect.kind === "blob")
      return blobSvg(P, { ...effect.look, speed, fps: effect.fps, still }, box, credit);
    if (isVectorKind(effect.kind))
      return fxMovingSvg(
        effect.kind,
        P,
        { angle, shape: effect.look.shape },
        box,
        still ? 0 : speed
      ).replace(/^<svg[^>]*>/, open => `${open}${svgComment(credit)}`);
    const design = glassDesign(angle, effect.look.shape);
    return glassSvg(design, glassField(design, glassColors(P)), { still, speed, cover: true })
      .replace('width="100%" height="100%"', `width="${box.width}" height="${box.height}"`)
      .replace(/^<svg[^>]*>/, open => `${open}${svgComment(credit)}`);
  })();
  const kept = finishOf(finish);
  return kept.soft || kept.grain
    ? finishSvg(drawn, box, kept, {
        underlay: effectUnderlay(P, effect, angle, kept.soft),
        grain: grain ?? null,
        /* the silk's light and shade are translucent layers over its dye, which Safari composites in linear light
           inside a filter, 9 levels off the site's picture: blurred through a pattern, they composite as anywhere */
        isolated: effect.kind === "silk"
      })
    : drawn;
}

/** The colors the effect draws, along the palette from its first: the glass's six behind its ribs, the papercut's
    sheets, and the colors the blob's balls are painted in, each once. */
export function effectColors(P: Palette, effect: Effect): string[] {
  if (effect.kind === "glass") return glassColors(P);
  /* each of the papercut's sheets is one of the palette's colors, at even steps along it */
  if (effect.kind === "papercut") return sampleStops(P, PAPERCUT_LOOK.sheets).map(s => s.hex);
  /* the silk's dye and the rosette's rings read the palette's curve end to end */
  if (isVectorKind(effect.kind)) return sampleStops(P, 6).map(s => s.hex);
  const scene = blobScene(P, BLOB_DESIGN, effect.look);
  const along = [...new Set(scene.blobs.flatMap(blob => blob.balls.map(ball => ball.at)))];
  return [...new Set(along.sort((a, b) => a - b).map(scene.color))];
}

/** An effect's settings as its address names them, defaults written out: the glass's shape 0 is the glass as designed,
    and a blob's null shape the one its palette's own numbers draw. The blob has no angle. A soft and a grain stand
    where the view has them, as a gradient's document writes them. */
function effectSettings(effect: Effect, angle: number, finish: EffectFinish = {}) {
  const { kind, speed, fps, look } = effect;
  const kept = finishOf(finish);
  return kind !== "blob"
    ? { style: kind, angle, ...kept, speed, fps, shape: look.shape ?? 0 }
    : { style: kind, ...kept, speed, fps, shape: look.shape, frost: look.frost, bg: look.bg };
}

/** The palette's keyframes and the effect's settings as JSON. */
export const effectSpecJson = (
  P: Palette,
  effect: Effect,
  angle: number,
  finish: EffectFinish = {}
): string => JSON.stringify({ ...toSpec(P), ...effectSettings(effect, angle, finish) }, null, 2);

/** The addresses an effect goes by, as a palette's document names its own files: its page, how it plays included, the
    stylesheet of its first frame, the script that plays it, its moving SVG, its first frame as PNG, and its share
    card, the address its page names (apps/web/src/lib/page-meta.ts effectCard). */
export function effectLinks(
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  card: string,
  finish: EffectFinish = {}
) {
  const base = origin.replace(/\/$/, "");
  const at = (extension: "css" | "js" | "svg" | "png") =>
    effectFileAddress(base, seed, effect, angle, extension, undefined, finish);
  return {
    page: effectPage(base, seed, effect, angle, true, finish),
    css: at("css"),
    /* an effect with no script has its stylesheet alone, which paints its still */
    js: hasEmbedScript(effect.kind) ? at("js") : null,
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
  card: string,
  finish: EffectFinish = {}
) => ({
  ...effectSettings(effect, angle, finish),
  colors: effectColors(P, effect),
  html: effectEmbedHtml(origin.replace(/\/$/, ""), seed, effect, angle, undefined, finish),
  links: effectLinks(origin, seed, effect, angle, card, finish)
});

/** What the palette's Markdown says at the effect's address in a gradient's place: a title naming the effect, a lead,
    how it is drawn and plays, the tags that play it behind a page, and its own files. English, as the file is. */
export const effectMarkdown =
  (origin: string, seed: string, effect: Effect, card: string): MarkdownEffect =>
  (P, name, doc) => {
    const angle = doc.angle;
    const finish = finishOf(doc);
    const { shape, frost, bg } = effect.look;
    const { js, ...links } = effectLinks(origin, seed, effect, angle, card, finish);
    const finished = [
      finish.soft ? `soft ${finish.soft}` : "",
      finish.grain ? `grain ${finish.grain}` : ""
    ]
      .filter(Boolean)
      .join(", ");
    const play =
      effect.speed === 0
        ? "held on its first frame"
        : `speed ${effect.speed}, up to ${effect.fps} frames a second`;
    const glass = effect.kind === "glass";
    const kind = effect.kind;
    const colors = doc.colors.join(", ");
    const scripted = hasEmbedScript(kind);
    /* a blob whose ground lets the page through has no gradient under its soft: its edges go clear */
    const softly = !finish.soft
      ? ""
      : effectUnderlay(P, effect, angle, finish.soft)
        ? "soft blurs it over the palette's gradient"
        : "soft blurs it with its edges going clear";
    return {
      called: `${name} ${kind === "glass" ? "fluted glass" : kind}`,
      lead:
        kind === "glass"
          ? `${name} played as fluted glass: its colors ${glassColors(P).join(", ")} drift behind ribbed glass. Two tags play it behind any page.`
          : kind === "silk"
            ? `${name} played as silk: the palette ${colors} dyed into satin that drapes in soft folds, each swaying slowly about the gather. Two tags play it behind any page.`
            : kind === "rosette"
              ? `${name} played as a rosette: petals on a golden spiral, each one color of the palette ${colors} by its ring, the rings rippling out from the heart as the petals grow. Two tags play it behind any page.`
              : kind === "papercut"
                ? `${name} played as papercut: the palette ${colors} cut into sheets of paper stacked into a relief that drifts and breathes, each sheet casting a soft shadow on the one below as the light swings slowly round. Two tags play it behind any page.`
                : `${name} played as a frosted blob: the palette's colors ${colors} melt into one another as it drifts. Two tags play it behind any page.`,
      drawn: `${
        kind === "glass"
          ? `fluted glass, its ribs at ${angle} degrees, shape ${shape ?? 0}, ${play}`
          : kind === "silk"
            ? `silk, its drape turned to ${angle} degrees, shape ${shape ?? 0}, ${play}`
            : kind === "rosette"
              ? `a rosette, turned to ${angle} degrees, shape ${shape ?? 0}, ${play}`
              : kind === "papercut"
                ? `papercut, its sheets climbing toward ${angle} degrees, shape ${shape ?? 0}, ${play}`
                : `a blob, the palette across it from left to right${shape === null ? "" : `, shape ${shape}`}, frost ${frost}, ${bg ? `on ${bg}` : "on no ground"}, ${play}`
      }${finished ? `, ${finished}` : ""}`,
      code: `## Behind a page

${!scripted ? "In the page's head, the stylesheet paints its first frame in the page's first paint: a plain SVG, which every browser paints at once." : kind === "papercut" ? "In the page's head, the stylesheet paints the first frame in the page's first paint, its shadows stepped, and the script plays it from there with WebGL, its shadows soft. Without WebGL the first frame stays, and for a reader who asks for less motion the script holds its own." : "In the page's head, the stylesheet paints the first frame in the page's first paint, and the script plays it from there with WebGL. Without WebGL, or for a reader who asks for less motion, the first frame stays."}${glass ? " The stylesheet's first frame is an SVG filter, light to send, which Firefox takes about a second of the page's thread to draw; the editor's Copy HTML writes it into the page as a WebP instead, which every browser paints at once." : ""}${finished ? ` Its ${[softly, finish.grain ? "grain lies over it" : ""].filter(Boolean).join(" and its ")}, in the first frame${scripted ? " and as it plays" : ""}.` : ""}

\`\`\`html
${effectEmbedHtml(origin.replace(/\/$/, ""), seed, effect, angle, undefined, finish)}
\`\`\``,
      files: {
        ...links,
        json: effectFileAddress(
          origin.replace(/\/$/, ""),
          seed,
          effect,
          angle,
          "json",
          undefined,
          finish
        ),
        ...(js ? { script: js } : {})
      }
    };
  };
