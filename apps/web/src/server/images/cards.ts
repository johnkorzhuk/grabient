/* A palette's pictures: its share card (/api/og) and its picture alone (/api/png, /{seed}.png), each in the view the
   address asks for, and the head an email wears. The key names what is drawn, so every address of one picture shares
   it. */
import { bandsSearch, bandsStill, isBands, parseBands } from "@grabient/engine/bands.ts";
import { decodePalette } from "@grabient/engine/codec.ts";
import { hexBytes } from "@grabient/engine/color.ts";
import { type Effect, parseEffect } from "@grabient/engine/effect.ts";
import { type Size, viewSearch } from "@grabient/engine/view.ts";
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

/** An effect's first frame at a size, as the editor shows it before it moves: the glass covering the box (its CPU
    renderer, engine/glass-render.ts) in three bytes a pixel, and the blobs covering it on their own ground
    (engine/blob.ts), in four where the ground lets what is behind them through or there is none, as the editor's
    copy of it is, or, for a card, which cannot be clear, laid over its near-black or near-white. Their code comes
    with the first picture that needs it. */
async function effectStill(
  found: Resolved,
  effect: Effect,
  angle: number,
  size: Size,
  card = false
): Promise<Uint8Array<ArrayBuffer>> {
  /* the silk, the rosette and the papercut by their CPU drawings (engine/silk-render.ts, rosette-render.ts,
     papercut-render.ts), opaque: about 0.1 s for a card, 0.35 s for the largest picture */
  if (effect.kind === "silk" || effect.kind === "rosette" || effect.kind === "papercut") {
    const look = { angle, shape: effect.look.shape };
    let rgba: Uint8ClampedArray;
    if (effect.kind === "papercut") {
      const [model, render] = await Promise.all([
        import("@grabient/engine/papercut.ts"),
        import("@grabient/engine/papercut-render.ts")
      ]);
      rgba = render.renderPapercut(model.papercutScene(found.palette, look, size), 0);
    } else if (effect.kind === "rosette") {
      const [model, render] = await Promise.all([
        import("@grabient/engine/rosette.ts"),
        import("@grabient/engine/rosette-render.ts")
      ]);
      rgba = render.renderRosette(model.rosetteScene(found.palette, look, size), 0, true);
    } else {
      const [model, render] = await Promise.all([
        import("@grabient/engine/silk.ts"),
        import("@grabient/engine/silk-render.ts")
      ]);
      rgba = render.renderSilk(model.silkScene(found.palette, look, size), 0);
    }
    const rgb = new Uint8Array(size.width * size.height * 3);
    for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) {
      rgb[j] = rgba[i];
      rgb[j + 1] = rgba[i + 1];
      rgb[j + 2] = rgba[i + 2];
    }
    return rgb;
  }
  if (effect.kind === "blob") {
    const blob = await import("@grabient/engine/blob.ts");
    return blob.blobStill(
      found.palette,
      effect.look,
      size,
      card ? blob.blobBackdrop(found.palette) : undefined
    );
  }
  const [model, render, colors] = await Promise.all([
    import("@grabient/engine/glass.ts"),
    import("@grabient/engine/glass-render.ts"),
    import("@grabient/engine/glass-colors.ts")
  ]);
  const { geometry, window } = render.glassCover(size, 1, angle, effect.look.shape);
  // one frame, drawn without holding the rib map and each pixel's read for frames to come
  const rgba = render
    .glassRenderer(geometry, window, undefined, true)
    .frame(model.glassField(geometry, colors.glassColors(found.palette)), 0);
  const rgb = new Uint8Array(window.w * window.h * 3);
  for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) {
    rgb[j] = rgba[i];
    rgb[j + 1] = rgba[i + 1];
    rgb[j + 2] = rgba[i + 2];
  }
  return rgb;
}

export function paletteCard(
  request: Request,
  env: PictureEnv,
  found: Resolved,
  params: URLSearchParams,
  keep: Keep
): Promise<Response> {
  /* style=glass or blob: the effect's first frame under the wordmark, which the page shows before it moves and a link
     to that page previews as */
  const effect = parseEffect(params);
  if (effect) {
    const { width, height } = cardSize(params);
    const angle = viewAt(params, found.palette.anchors.length).angle;
    return answerPicture(
      request,
      env,
      {
        kind: "card",
        branded: true,
        parts: [...effectParts(effect, angle), found.seed, width, height, true],
        width,
        height,
        draw: async () =>
          drawCardOver(
            await effectStill(found, effect, angle, { width, height }, true),
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
  // style=glass or blob: the effect's first frame alone
  const effect = parseEffect(params);
  if (effect) {
    const angle = viewAt(params, found.palette.anchors.length).angle;
    return answerPicture(
      request,
      env,
      {
        kind: "png",
        branded: false,
        parts: [
          ...effectParts(effect, angle),
          ...(effect.kind === "blob" ? [BLOB_PICTURE] : []),
          found.seed,
          width,
          height,
          false
        ],
        width,
        height,
        draw: async () =>
          encodePng(width, height, await effectStill(found, effect, angle, { width, height }))
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
