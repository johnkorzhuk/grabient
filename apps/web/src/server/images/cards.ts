/* A palette's pictures: its share card (/api/og) and its picture alone (/api/png, /{seed}.png), each in the view the
   address asks for, and the head an email wears. The key names what is drawn, so every address of one picture shares
   it. */
import { bandsSearch, bandsStill, isBands, parseBands } from "@grabient/engine/bands.ts";
import { decodePalette } from "@grabient/engine/codec.ts";
import { hexBytes } from "@grabient/engine/color.ts";
import { type Effect, type EffectFinish, parseEffect } from "@grabient/engine/effect.ts";
import { finishOf, viewSearch } from "@grabient/engine/view.ts";
import { MARK_FIXED } from "@grabient/ui/mark.ts";
import { type Saved, viewAt } from "../files/address.ts";
import type { Resolved } from "../files/resolve.ts";
import {
  drawCard,
  drawCardOver,
  drawPicture,
  keyframeColors,
  type Look,
  lookOf,
  lookSoon
} from "./paint.ts";
import { encodePng } from "./png.ts";
import { answerPicture, type Keep, type PictureEnv } from "./serve.ts";
import { cardSize, pictureSize } from "./size.ts";

/** The animated SVG's drawing, which a change to engine/bands.ts that moves its pixels counts up, so no card or picture
    drawn before is kept for it. */
const BANDS_DRAWING = "bands-1";
/** The effects' drawings, counted up as the bands' is by a change that moves their pixels (engine/glass.ts and
    glass-render.ts, engine/blob.ts). */
const EFFECT_DRAWING = {
  glass: "glass-2",
  blob: "blob-3",
  silk: "silk-1",
  rosette: "rosette-1",
  papercut: "papercut-1"
} as const;
/** The blob's picture alone, counted apart from its cards, which stay solid: it is clear where its ground lets the
    page through. */
const BLOB_PICTURE = "clear-1";

/** Everything an effect's first frame depends on: the glass's colors are its palette's, its ribs turn with the angle
    and its shape draws them and the discs; the blob's look, all but its pace, shapes it, and it has no angle. */
const effectParts = (effect: Effect, angle: number) =>
  effect.kind === "blob"
    ? [EFFECT_DRAWING.blob, effect.look.frost, effect.look.shape, effect.look.bg]
    : [EFFECT_DRAWING[effect.kind], angle, effect.look.shape ?? 0];
/** The finish over an effect's frame (engine/fx-finish.ts), counted up by a change to it that moves its pixels. */
const EFFECT_FINISH = "fx-finish-1";
/* A soft or grained effect's own part of its key: none for a plain one, whose key, and the pictures kept under it,
   stand as they were. The blob's gradient under its soft lies left to right whatever the address's angle, which its
   parts leave out. */
const effectFinishPart = (finish: EffectFinish) =>
  finish.soft || finish.grain ? [`${EFFECT_FINISH}:${finish.soft ?? 0}:${finish.grain ?? 0}`] : [];
/* An effect's first frame finished (effect-frame.ts), its code loaded with the first one drawn: the picture routes
   import this module, so the router's first request reaches it, and none of the drawing comes with that. */
const effectFrame = async (...args: Parameters<typeof import("./effect-frame.ts").effectFrame>) =>
  (await import("./effect-frame.ts")).effectFrame(...args);

export function paletteCard(
  request: Request,
  env: PictureEnv,
  found: Resolved,
  params: URLSearchParams,
  keep: Keep
): Promise<Response> {
  /* style=glass, blob, silk or rosette: the effect's first frame under the wordmark, soft and grained as the address
     asks, which the page shows before it moves and a link to that page previews as */
  const effect = parseEffect(params);
  if (effect) {
    const { width, height } = cardSize(params);
    const view = viewAt(params, found.palette.anchors.length);
    const finish = finishOf(view);
    return answerPicture(
      request,
      env,
      {
        kind: "card",
        branded: true,
        parts: [
          ...effectParts(effect, view.angle),
          found.seed,
          width,
          height,
          true,
          ...effectFinishPart(finish)
        ],
        width,
        height,
        draw: async () =>
          drawCardOver(
            await effectFrame(
              found.palette,
              effect,
              view.angle,
              { width, height },
              { card: true, finish }
            ),
            keyframeColors(found.palette),
            width,
            height
          )
      },
      keep
    );
  }
  // style=bands: the animated SVG's still frame under the wordmark, which a link to that SVG previews as
  if (isBands(params)) {
    const bands = parseBands(params);
    const { width, height } = cardSize(params);
    return answerPicture(
      request,
      env,
      {
        kind: "card",
        branded: true,
        parts: [BANDS_DRAWING, found.seed, bands, width, height, true],
        width,
        height,
        draw: () =>
          drawCardOver(
            bandsStill(found.palette, bands, { width, height }),
            keyframeColors(found.palette),
            width,
            height
          )
      },
      keep
    );
  }
  const view = viewAt(params, found.palette.anchors.length);
  const { width, height, chips } = cardSize(params);
  return answerPicture(
    request,
    env,
    {
      kind: "card",
      branded: true,
      parts: [
        "palette",
        found.seed,
        view.style,
        view.steps,
        view.angle,
        width,
        height,
        true,
        chips,
        ...finishPart(view)
      ],
      width,
      height,
      draw: async () =>
        drawCard(
          await lookSoon(found.palette, view),
          chips ? keyframeColors(found.palette) : null,
          width,
          height
        )
    },
    keep
  );
}

export function palettePicture(
  request: Request,
  env: PictureEnv,
  found: Resolved,
  params: URLSearchParams,
  keep: Keep
): Promise<Response> {
  const { width, height } = pictureSize(params);
  // style=glass, blob, silk or rosette: the effect's first frame alone, soft and grained as the address asks
  const effect = parseEffect(params);
  if (effect) {
    const view = viewAt(params, found.palette.anchors.length);
    const finish = finishOf(view);
    return answerPicture(
      request,
      env,
      {
        kind: "png",
        branded: false,
        parts: [
          ...effectParts(effect, view.angle),
          ...(effect.kind === "blob" ? [BLOB_PICTURE] : []),
          found.seed,
          width,
          height,
          false,
          ...effectFinishPart(finish)
        ],
        width,
        height,
        draw: async () =>
          encodePng(
            width,
            height,
            await effectFrame(found.palette, effect, view.angle, { width, height }, { finish })
          )
      },
      keep
    );
  }
  // style=bands: the animated SVG's still frame alone
  if (isBands(params)) {
    const bands = parseBands(params);
    return answerPicture(
      request,
      env,
      {
        kind: "png",
        branded: false,
        svg: `/${found.seed}.svg${bandsSearch(bands, [`size=${width}x${height}`])}`,
        parts: [BANDS_DRAWING, found.seed, bands, width, height, false],
        width,
        height,
        draw: () => encodePng(width, height, bandsStill(found.palette, bands, { width, height }))
      },
      keep
    );
  }
  const view = viewAt(params, found.palette.anchors.length);
  return answerPicture(
    request,
    env,
    {
      kind: "png",
      branded: false,
      svg: `/${found.seed}.svg${viewSearch({ ...view, size: { width, height } })}`,
      parts: [
        "palette",
        found.seed,
        view.style,
        view.steps,
        view.angle,
        width,
        height,
        false,
        ...finishPart(view)
      ],
      width,
      height,
      draw: async () => drawPicture(await lookSoon(found.palette, view), width, height)
    },
    keep
  );
}

/* a soft or grained picture's own part of its key: none for a plain one, whose key, and the pictures kept under it,
   stand as they were */
const finishPart = (view: { soft?: number; grain?: number }) =>
  view.soft || view.grain ? [`finish:${view.soft ?? 0}:${view.grain ?? 0}`] : [];

const BRAND: Look = { colors: MARK_FIXED.map(hexBytes), style: "linearGradient", angle: 90 };

/** An email's head: the palette it wears in its saved view, or the brand's gradient where it wears none (or one that is
    no palette), with the wordmark and no chips. An account email carries it as a picture of its own, so no image
    allowance applies: the email's ceilings bound it. */
export function emailHead(worn: (Saved & { seed: string }) | undefined, width = 800, height = 200) {
  const P = worn && decodePalette(worn.seed);
  const look = P ? lookOf(P, viewAt(new URLSearchParams(), P.anchors.length, worn)) : BRAND;
  return drawCard(look, null, width, height);
}
