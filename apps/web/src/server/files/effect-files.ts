/* A palette's effect (effect.ts's EFFECTS) as files, which load with the first one asked for.
   The page background is two files whose address is the whole setting:
     <link rel="stylesheet" href="https://grabient.com/{seed}.css?style=glass">
     <script src="https://grabient.com/{seed}.js?style=glass" async></script>
   The stylesheet paints the effect's first frame behind the page, as its palette's page paints it (glass-still.ts,
   blob-still.ts, fx-still.ts), its soft and grain as the page's stage lays them, and being a stylesheet it is in the
   page's first paint; the script (src/embed) plays the effect from that very frame. The still is a layer fixed behind
   the page, where the script's canvas comes: the glass's, the silk's, the rosette's and the papercut's canvases are
   opaque and fade in over it (the papercut's bringing the soft shadows its still steps), and the blob's is clear
   around the blob, so its still goes in the frame the canvas comes (the script marks the root). Both and the moving
   SVG are the engine's writing (engine/effect-code.ts), which the editor's copies are too. */
import {
  CLEAR_GROUND,
  EFFECT_KINDS,
  type Effect,
  type EffectFinish,
  type EffectKind,
  effectAddressParts
} from "@grabient/engine/effect.ts";
import { effectSize, effectStylesheet, effectSvg } from "@grabient/engine/effect-code.ts";
import { kitRecord } from "@grabient/engine/kit/kinds.ts";
import { kitEffect } from "@grabient/engine/kit/registry.ts";
import { readingName, readPalette } from "@grabient/engine/name.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { resolveSize, type Size, type SizeChoice } from "@grabient/engine/view.ts";
import { ANIMATION, EMBEDDED } from "../../lib/cache.ts";
import { effectCard } from "../../lib/page-meta.ts";
import { isLinkPreview } from "../crawlers.ts";
import { svgPreview } from "./preview.ts";

/* what each effect's SVG shows, every kind its own; the strings' on their designed ground, `a dark ground`, which a
   ground their address names takes the place of (svgAbout) */
const SVG_SHOWS: Record<EffectKind, string> = {
  glass: "fluted glass with its colors drifting behind the ribs",
  blob: "a frosted blob of its colors, drifting",
  silk: "its colors dyed into silk that drapes in soft folds, swaying",
  rosette: "a rosette of petals in its colors, the rings rippling out from the heart",
  papercut:
    "its colors cut into sheets of paper stacked into a relief, each casting a soft shadow on the one below",
  strings: "threads in its colors, evenly spaced on a dark ground, stirred into bundles and loops",
  dimple:
    "a sheet of round scales in its colors pressed in at one point, the darker end of the palette in the hollow",
  aurora:
    "light in its colors, from the palette's darker end to its lighter, rising in curtains behind a still range",
  /* a field effect's own words (kit/types.ts FieldAbout) */
  ...kitRecord(kind => kitEffect(kind).about.shows)
};

/** A link preview's words for an effect's SVG: what it shows, on the ground its address names where it takes one in
    place of its designed one, and how it moves, as effect.ts's EFFECT_KINDS says. */
const svgAbout = (effect: Effect): string => {
  const { kind, look } = effect;
  const motion = EFFECT_KINDS[kind].svgMotion;
  const shows =
    look.bg !== null && EFFECT_KINDS[kind].ground === "designed"
      ? SVG_SHOWS[kind].replace(
          "a dark ground",
          look.bg === CLEAR_GROUND ? "a clear ground" : `a ground of ${look.bg}`
        )
      : SVG_SHOWS[kind];
  if (motion)
    return `An animated SVG of a Grabient palette: ${shows}, moved by ${motion === "css" ? "CSS" : "SMIL"} alone.`;
  /* one the pointer moves has no loop and no clip: its SVG is its still */
  if (EFFECT_KINDS[kind].motion === "pointer")
    return `An SVG of a Grabient palette: ${shows}, its still; on its page, and behind another by its script, its hollow follows the pointer.`;
  /* what plays one whose SVG holds its first frame, as the table says: its script, its clips and its shaders, each
     where it has them (the aurora's clips alone, for now), and its page alone where it has none */
  const { embed, video, shader } = EFFECT_KINDS[kind];
  const by = [embed ? "script" : "", video ? "clips" : "", shader ? "shaders" : ""].filter(Boolean);
  const plays =
    by.length === 0
      ? "its page plays it"
      : `its ${by.length === 1 ? by[0] : `${by.slice(0, -1).join(", ")} and ${by[by.length - 1]}`} ${by.length === 1 && by[0] === "script" ? "plays" : "play"} it`;
  return `An SVG of a Grabient palette: ${shows}, its first frame; ${plays}.`;
};

/** /{seed}.css?style=: the effect's first frame behind the page, finished by the view's soft and grain, `grain` the
    grain's tile as a CSS image. */
export const effectCssAnswer = (
  origin: string,
  seed: string,
  P: Palette,
  effect: Effect,
  angle: number,
  finish: EffectFinish = {},
  grain?: string
): Response =>
  new Response(effectStylesheet(P, seed, effect, angle, origin, finish, grain), {
    headers: { ...ANIMATION, ...EMBEDDED, "Content-Type": "text/css; charset=utf-8" }
  });

/** /{seed}.svg?style=glass or blob: the moving SVG, 800 by 400 for the glass and 500 by 500 for the blob unless the
    address asks; an app previewing a posted link gets a page whose card is the effect's first frame (preview.ts). */
export async function effectSvgAnswer(
  request: Request,
  origin: string,
  seed: string,
  P: Palette,
  effect: Effect,
  angle: number,
  asked: SizeChoice | null | undefined,
  finish: EffectFinish = {},
  grain?: (size: Size) => Promise<string>
): Promise<Response> {
  const size = resolveSize(asked, effectSize(effect));
  if (isLinkPreview(request)) {
    /* what the file is, its motion as effect.ts's EFFECT_KINDS has it: moved by CSS, by SMIL, or its first frame */
    const sized = asked ? [`w=${size.width}`, `h=${size.height}`] : [];
    return svgPreview({
      address: `${origin}/${seed}.svg?${[...effectAddressParts(effect, angle, finish), ...sized].join("&")}`,
      card: `${origin}${effectCard(seed, effect, angle, finish)}`,
      title: `${readingName(readPalette(P))} · Grabient`,
      about: svgAbout(effect)
    });
  }
  const image = grain ? await grain(size) : undefined;
  return new Response(effectSvg(P, seed, effect, angle, size, origin, finish, image), {
    headers: { ...ANIMATION, ...EMBEDDED, "Content-Type": "image/svg+xml; charset=utf-8" }
  });
}
