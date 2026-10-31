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
import { drawCard, drawCardOver, drawPicture, keyframeColors, type Look, lookOf } from "./paint.ts";
import { encodePng } from "./png.ts";
import { answerPicture, type Keep, type PictureEnv } from "./serve.ts";
import { cardSize, pictureSize } from "./size.ts";

/** The animated SVG's drawing, which a change to engine/bands.ts that moves its pixels counts up, so no card or picture
    drawn before is kept for it. */
const BANDS_DRAWING = "bands-1";
/** The effects' drawings, counted up as the bands' is by a change that moves their pixels (engine/glass.ts and
    glass-render.ts, engine/blob.ts). */
const EFFECT_DRAWING = { glass: "glass-1", blob: "blob-1" } as const;

/** Everything an effect's first frame depends on: the glass's colors are its palette's and its ribs turn with the
    angle; the blob's look, all but its pace, shapes it. */
const effectParts = (effect: Effect, angle: number) =>
  effect.kind === "glass"
    ? [EFFECT_DRAWING.glass, angle]
    : [
        EFFECT_DRAWING.blob,
        effect.look.depth,
        effect.look.fill,
        effect.look.frost,
        effect.look.shape,
        effect.look.bg
      ];

/** An effect's first frame at a size, as the editor shows it before it moves, in three bytes a pixel: the glass
    covering the box (its CPU renderer, engine/glass-render.ts), the blob fitted in it on its own ground, or where it
    has none on the near-black or near-white a picture that cannot be clear takes (engine/blob.ts). Their code comes
    with the first picture that needs it. */
async function effectStill(
  found: Resolved,
  effect: Effect,
  angle: number,
  size: Size
): Promise<Uint8Array<ArrayBuffer>> {
  if (effect.kind === "blob") {
    const blob = await import("@grabient/engine/blob.ts");
    return blob.blobStill(found.palette, effect.look, size, blob.blobBackdrop(found.palette));
  }
  const [model, render, colors] = await Promise.all([
    import("@grabient/engine/glass.ts"),
    import("@grabient/engine/glass-render.ts"),
    import("@grabient/engine/glass-colors.ts")
  ]);
  const { geometry, window } = render.glassCover(size, 1, angle);
  const rgba = render
    .glassRenderer(geometry, window)
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
            await effectStill(found, effect, angle, { width, height }),
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
        chips
      ],
      width,
      height,
      draw: () =>
        drawCard(
          lookOf(found.palette, view),
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
        parts: [...effectParts(effect, angle), found.seed, width, height, false],
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
      parts: ["palette", found.seed, view.style, view.steps, view.angle, width, height, false],
      width,
      height,
      draw: () => drawPicture(lookOf(found.palette, view), width, height)
    },
    keep
  );
}

const BRAND: Look = { colors: MARK_FIXED.map(hexBytes), style: "linearGradient", angle: 90 };

/** An email's head: the palette it wears in its saved view, or the brand's gradient where it wears none (or one that is
    no palette), with the wordmark and no chips. An account email carries it as a picture of its own, so no image
    allowance applies: the email's ceilings bound it. */
export function emailHead(worn: (Saved & { seed: string }) | undefined, width = 800, height = 200) {
  const P = worn && decodePalette(worn.seed);
  const look = P ? lookOf(P, viewAt(new URLSearchParams(), P.anchors.length, worn)) : BRAND;
  return drawCard(look, null, width, height);
}
