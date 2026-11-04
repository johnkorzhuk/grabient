/* An effect behind another site's page as Grabient hands it over: the tags for the page's head (effectEmbedHtml) and
   the rules that paint its first frame there (effectLayerCss), finished by the view's soft and grain. They live apart
   from effect.ts, which every page's start and the Worker's first request read for an effect's address, since only
   what loads with a copy, a file or the embed's script writes them. */
import {
  type Effect,
  type EffectFinish,
  EMBED_PLAYING,
  effectFileAddress,
  hasEmbedScript
} from "./effect.ts";

/** What a view's soft and grain lay with an effect's first frame behind a page, as the site's stage lays them over its
    picture (effect-code.ts effectLayers writes them), each a CSS value where the view has it: the still's blur, a
    filter whose deviation is a share of the page's longer side; the palette's gradient under the blurred still, which
    its edges thin to; and the grain's tile over both, a speck a CSS pixel from the page's corner. */
export interface EffectLayers {
  /** the still's filter, `blur(…vmax)` */
  blur?: string;
  /** the background under the still: its palette's gradient */
  under?: string;
  /** the background over all: the grain's tile, its image and its size */
  grain?: string;
}

const layer = (selector: string, z: number, rules: string) =>
  `${selector} {\n  content: "";\n  position: fixed;\n  inset: 0;\n  z-index: ${z};\n  pointer-events: none;\n${rules}}\n`;

/** The rules that paint an effect's first frame behind a page: a layer fixed behind it, under its content and over its
    ground, showing the still (a CSS background), which it gives up once the script's canvas covers it. A soft view
    blurs that layer (`layers.blur`) over another under it, its palette's gradient (`layers.under`), as the site's
    stage blurs its picture over the gradient; a grained one lays the grain's tile over the still on a layer of its
    own (`layers.grain`), the first thing the page's body holds, so it lies over the still and under all the page's
    own, and the script's canvas brings its own over itself. Each of these gives way as the canvas plays. */
export function effectLayerCss(still: string, layers: EffectLayers = {}): string {
  const { blur, under, grain } = layers;
  const playing = `html[${EMBED_PLAYING}]`;
  return [
    layer("html::before", -1, `  background: ${still};\n${blur ? `  filter: ${blur};\n` : ""}`),
    under ? layer("html::after", -2, `  background: ${under};\n`) : "",
    grain
      ? layer("body::before", -1, `  background: ${grain};\n  image-rendering: pixelated;\n`)
      : "",
    `${playing}::before {\n  background: none;\n${blur ? "  filter: none;\n" : ""}}\n`,
    under || grain
      ? `${[under ? `${playing}::after` : "", grain ? `${playing} body::before` : ""].filter(Boolean).join(",\n")} {\n  background: none;\n}\n`
      : ""
  ].join("");
}

/** An effect's first frame as the background of the elements a selector names, as the selection's CSS gives each
    palette a rule: the still covering the element, finished as effectLayerCss finishes a page's. Unsoftened, the
    still is the element's own background, the grain's tile over it as another layer. Soft, the still is blurred on a
    layer under the element's content, its edges thinning to the palette's gradient, the element's own background,
    which keeps the blur inside its box; the grain's tile lies over it on a layer of its own, under the content too.
    `layers.blur` is the filter in the element's own measure, as a page's `vmax` means nothing to an element. */
export function effectRuleCss(selector: string, still: string, layers: EffectLayers = {}): string {
  const { blur, under, grain } = layers;
  if (!blur) return `${selector} {\n  background: ${grain ? `${grain}, ` : ""}${still};\n}\n`;
  const own = (pseudo: "before" | "after", rules: string) =>
    `${selector}::${pseudo} {\n  content: "";\n  position: absolute;\n  inset: 0;\n  z-index: -1;\n  border-radius: inherit;\n  pointer-events: none;\n${rules}}\n`;
  return [
    `${selector} {\n  position: relative;\n  isolation: isolate;\n  overflow: hidden;\n  background: ${under ?? "none"};\n}\n`,
    own("before", `  background: ${still};\n  filter: ${blur};\n`),
    grain ? own("after", `  background: ${grain};\n`) : ""
  ].join("");
}

/** The tags that play an effect behind a page, for its head: its first frame, then the script that plays it from
    there. With the still, the first frame is in the page itself, a style, finished by the view's `layers` (soft and
    grain), so the page waits on no other site to paint; without, the stylesheet of the same address paints it. */
export function effectEmbedHtml(
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  still?: string,
  finish: EffectFinish = {},
  layers: EffectLayers = {}
): string {
  const at = (extension: "css" | "js") =>
    effectFileAddress(origin, seed, effect, angle, extension, undefined, finish).replaceAll(
      "&",
      "&amp;"
    );
  const first = still
    ? `<style>\n${effectLayerCss(still, layers)}</style>`
    : `<link rel="stylesheet" href="${at("css")}">`;
  return hasEmbedScript(effect.kind)
    ? `${first}\n<script src="${at("js")}" async></script>`
    : first;
}
