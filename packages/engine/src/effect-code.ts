/* An effect's code as Grabient hands it over, written once for the Worker's files (apps/web/src/server/files) and for
   the editor's copies and code pane, so a copy says what the effect's address serves: the stylesheet that paints its
   first frame behind a page, its SVG, the colors it draws, its settings beside the palette's keyframes, and what the
   palette's Markdown and JSON say of it. It holds both effects' drawings, so a page or an isolate loads it with the
   first effect it hands over, never at its start. */
import { AURORA_DESIGNED_PATH } from "./aurora-path.ts";
import { BLOB_DESIGN, BLOB_SIZE, blobScene, blobStillBackground, blobSvg } from "./blob.ts";
import { gradientCss } from "./css.ts";
import { sampleStops } from "./curve.ts";
import {
  CLEAR_GROUND,
  EFFECT_KINDS,
  EFFECT_WORDS,
  EFFECTS,
  type Effect,
  type EffectFinish,
  type EffectKind,
  type EffectLook,
  effectAddressParts,
  effectBare,
  effectFileAddress,
  effectFinish,
  effectStillParts,
  fxLookOf,
  hasEmbedScript,
  isVectorKind
} from "./effect.ts";
import { type EffectLayers, effectEmbedHtml, effectLayerCss } from "./effect-embed.ts";
import { effectUnderlay, finishSvg } from "./fx-finish.ts";
import { fxMovingSvg, fxStillBackground } from "./fx-still.ts";
import { glassDesign, glassField, glassStillBackground, glassSvg } from "./glass.ts";
import { glassColors } from "./glass-colors.ts";
import { GRAIN_SIDE } from "./grain.ts";
import { isKitKind } from "./kit/kinds.ts";
import { kitEffect } from "./kit/registry.ts";
import type { MarkdownEffect } from "./markdown.ts";
import { titleWords } from "./name.ts";
import type { Palette } from "./palette.ts";
import { PAPERCUT_LOOK } from "./papercut.ts";
import { toSpec } from "./spec.ts";
import { svgComment } from "./svg-comment.ts";
import { DEFAULT_SIZE, DEFAULT_STYLE, effectSoftShare, type Size } from "./view.ts";

/** The steps an effect draws at, which its document and its Markdown name: its look's, its designed number where the
    look names none; null for an effect that takes no steps. Here, where those are written, so no page's start carries
    it. */
export const effectStepsShown = (
  kind: EffectKind,
  look: Pick<EffectLook, "steps">
): number | null => look.steps ?? EFFECT_KINDS[kind].steps?.designed ?? null;

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
      ? fxStillBackground(effect.kind, P, fxLookOf(effect.look, angle))
      : blobStillBackground(P, { speed: 1, fps: null, still: true, ...effect.look });

/** What the view's soft and grain lay with the effect's still behind a page (effect-embed.ts effectLayerCss), as the
    site's stage finishes its picture (fx-finish.ts): the still blurred by a share of the page's longer side, in `vmax`
    as the stage's blur is in its box's `cqmax`, over its palette's gradient at the effect's angle, its stops blurred
    by the same soft (the blob takes none, effect.ts effectFinish), and the grain's tile over both at one speck a CSS
    pixel, `grain` the tile at the view's grain as a CSS image (`url("data:…")`, the Worker's or the editor's own,
    engine/grain.ts grainPng). */
export function effectLayers(
  P: Palette,
  effect: Effect,
  angle: number,
  finish: EffectFinish = {},
  grain?: string | null
): EffectLayers {
  const { soft, grain: grained } = effectFinish(effect.kind, finish);
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

/** How each effect's SVG moves at a speed: by CSS animations, by SMIL (the silk's rings), or not at all (the papercut's,
    its still at any speed: fx-still.ts fxMovingSvg), as effect.ts's EFFECT_KINDS says. */
export const EFFECT_SVG_MOTION: Readonly<Record<EffectKind, "css" | "smil" | null>> =
  Object.fromEntries(EFFECTS.map(kind => [kind, EFFECT_KINDS[kind].svgMotion])) as Record<
    EffectKind,
    "css" | "smil" | null
  >;

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
        fxLookOf(effect.look, angle),
        box,
        still ? 0 : speed
      ).replace(/^<svg[^>]*>/, open => `${open}${svgComment(credit)}`);
    const design = glassDesign(angle, effect.look.shape);
    return glassSvg(design, glassField(design, glassColors(P)), { still, speed, cover: true })
      .replace('width="100%" height="100%"', `width="${box.width}" height="${box.height}"`)
      .replace(/^<svg[^>]*>/, open => `${open}${svgComment(credit)}`);
  })();
  const kept = effectFinish(effect.kind, finish);
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
    and a blob's null shape the one its palette's own numbers draw. The blob has no angle and no soft. A soft and a
    grain stand where the view has them, as a gradient's document writes them; the steps where the effect takes them,
    its designed number where its look names none; a zoom where the effect takes one in its shape's place (the
    dimple's), its designed zoom where its look names none, and its `roam` while it roams; a path where the effect
    takes one beside its shape (the aurora's), its designed path where its look names none; the strings' ground and the
    aurora's range's where their look names one, none being the strings' designed ground and the aurora's clear
    range (the blob's `bg` always stands, none being clear). */
function effectSettings(effect: Effect, angle: number, finish: EffectFinish = {}) {
  const { kind, speed, fps, look } = effect;
  const kept = effectFinish(kind, finish);
  const steps = effectStepsShown(kind, look);
  const { zoom, path } = EFFECT_KINDS[kind];
  return kind !== "blob"
    ? {
        style: kind,
        ...(steps === null ? {} : { steps }),
        angle,
        ...kept,
        speed,
        fps,
        ...(effect.roam ? { roam: true } : {}),
        ...(zoom ? { zoom: look.zoom ?? zoom.designed } : { shape: look.shape ?? 0 }),
        ...(path ? { path: look.path ?? AURORA_DESIGNED_PATH } : {}),
        ...(look.bg !== null && EFFECT_KINDS[kind].ground ? { bg: look.bg } : {})
      }
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
    const finish = effectFinish(effect.kind, doc);
    const { shape, frost, bg } = effect.look;
    const steps = effectStepsShown(effect.kind, effect.look);
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
    /* a picture that lets the page through has no gradient under its soft: its edges go clear */
    const softly = !finish.soft
      ? ""
      : effectBare(kind, effect.look)
        ? "soft blurs it with its edges going clear"
        : "soft blurs it over the palette's gradient";
    /* the strings' ground where their look names one: a color, or clear */
    const clear = bg === CLEAR_GROUND;
    const [lead, drawn] = ((): [string, string] => {
      /* a field effect says what it shows in its own words (kit/types.ts FieldAbout) */
      if (isKitKind(kind))
        return [
          kitEffect(kind).about.describe.replace("{name}", name).replace("{colors}", colors),
          `${EFFECT_WORDS[kind]}, turned to ${angle} degrees, ${steps === null ? "" : `${steps} steps, `}shape ${shape ?? 0}, ${play}`
        ];
      switch (kind) {
        case "glass":
          return [
            `${name} played as fluted glass: its colors ${glassColors(P).join(", ")} drift behind ribbed glass.`,
            `fluted glass, its ribs at ${angle} degrees, shape ${shape ?? 0}, ${play}`
          ];
        case "silk":
          return [
            `${name} played as silk: the palette ${colors} dyed into satin that drapes in soft folds, each swaying slowly about the gather.`,
            `silk, its drape turned to ${angle} degrees, shape ${shape ?? 0}, ${play}`
          ];
        case "rosette":
          return [
            `${name} played as a rosette: petals on a golden spiral, each one color of the palette ${colors} by its ring, the rings rippling out from the heart as the petals grow.`,
            `a rosette, turned to ${angle} degrees, shape ${shape ?? 0}, ${play}`
          ];
        case "papercut":
          return [
            `${name} played as papercut: the palette ${colors} cut into sheets of paper stacked into a relief that drifts and breathes, each sheet casting a soft shadow on the one below as the light swings slowly round.`,
            `papercut, its sheets climbing toward ${angle} degrees, shape ${shape ?? 0}, ${play}`
          ];
        case "dimple":
          return [
            `${name} played as a dimple: a sheet of round scales pressed in at one point, each disc running a little of the palette ${colors} toward the hollow, the darker end of the palette in it. ${effect.roam ? "The hollow roams: it goes round a slow loop by itself, from the middle and back to it." : "Nothing in it moves by itself: the hollow follows the pointer and stays where the pointer left it."}`,
            `a dimple, its sheet and its light turned to ${angle} degrees, zoom ${effect.look.zoom ?? 1}, ${effect.speed === 0 ? "its hollow held at its rest" : `its hollow ${effect.roam ? "roaming its loop" : "following the pointer"} at speed ${effect.speed}, up to ${effect.fps} frames a second`}`
          ];
        case "aurora":
          return [
            `${name} played as an aurora: the palette ${colors} as light boiling up behind a still range, its darker end the night and its lighter end the hottest light, the range ${bg === null ? "clear, the page through it" : `filled with ${bg}`}.`,
            `an aurora, turned to ${angle} degrees, shape ${shape ?? 0}, its range ${effect.look.path === null ? "as designed" : `the path ${effect.look.path}`}${bg === null ? ", clear" : `, filled with ${bg}`}, ${play}`
          ];
        case "strings":
          return [
            `${name} played as strings: ribbons of threads on ${bg === null ? "a dark ground" : clear ? "a clear ground, the page through it" : `a ground of ${bg}`}, each running the palette ${colors} across it, folding and morphing in place into hairpins and loops.`,
            `strings, its stirring turned to ${angle} degrees, shape ${shape ?? 0}${bg === null ? "" : clear ? ", on a clear ground" : `, on ${bg}`}, ${play}`
          ];
        case "blob":
          return [
            `${name} played as a frosted blob: the palette's colors ${colors} melt into one another as it drifts.`,
            `a blob, the palette across it from left to right${shape === null ? "" : `, shape ${shape}`}, frost ${frost}, ${bg ? `on ${bg}` : "on no ground"}, ${play}`
          ];
      }
    })();
    return {
      called: `${name} ${titleWords(DEFAULT_STYLE, kind)}`,
      lead: `${lead} ${scripted ? "Two tags play it" : "One tag paints its still"} behind any page.`,
      drawn: `${drawn}${finished ? `, ${finished}` : ""}`,
      code: `## Behind a page

${kind === "aurora" ? "In the page's head, the stylesheet paints its still in the page's first paint: its first frame's light in broad wedges under a blur behind its range, a plain SVG, which every browser paints at once." : !scripted ? "In the page's head, the stylesheet paints its first frame in the page's first paint: a plain SVG, which every browser paints at once." : kind === "papercut" ? "In the page's head, the stylesheet paints the first frame in the page's first paint, its shadows stepped, and the script plays it from there with WebGL, its shadows soft. Without WebGL the first frame stays, and for a reader who asks for less motion the script holds its own." : kind === "dimple" ? "In the page's head, the stylesheet paints its still in the page's first paint, the hollow at its rest, and the script, with WebGL, then has the hollow follow the pointer over the page and stay where the pointer left it. Without WebGL, or for a reader who asks for less motion, the still stays." : "In the page's head, the stylesheet paints the first frame in the page's first paint, and the script plays it from there with WebGL. Without WebGL, or for a reader who asks for less motion, the first frame stays."}${glass ? " The stylesheet's first frame is an SVG filter, light to send, which Firefox takes about a second of the page's thread to draw; the editor's Copy HTML writes it into the page as a WebP instead, which every browser paints at once." : ""}${finished ? ` Its ${[softly, finish.grain ? "grain lies over it" : ""].filter(Boolean).join(" and its ")}, in the first frame${scripted ? " and as it plays" : ""}.` : ""}

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
