/* A palette's pictures: its share card (/api/og) and its picture alone (/api/png, /{seed}.png), each in the view the
   address asks for, and the head an email wears. The key names what is drawn, so every address of one picture shares
   it. */
import { bandsSearch, bandsStill, isBands, parseBands } from "@grabient/engine/bands.ts";
import { blobBackdrop, blobSearch, blobStill, isBlob, parseBlob } from "@grabient/engine/blob.ts";
import { decodePalette } from "@grabient/engine/codec.ts";
import { hexBytes } from "@grabient/engine/color.ts";
import { viewSearch } from "@grabient/engine/view.ts";
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
/** The animated blob's drawing, counted up the same way for a change to engine/blob.ts that moves its pixels. */
const BLOB_DRAWING = "blob-2";

export function paletteCard(
  request: Request,
  env: PictureEnv,
  found: Resolved,
  params: URLSearchParams,
  keep: Keep
): Promise<Response> {
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
  // style=blob: the blob's first frame on its ground, or on a backdrop, under the wordmark: what a link to it previews as
  if (isBlob(params)) {
    const blob = parseBlob(params);
    const { width, height } = cardSize(params);
    return answerPicture(
      request,
      env,
      {
        kind: "card",
        branded: true,
        parts: [BLOB_DRAWING, found.seed, blobSearch(blob, [], false), width, height, true],
        width,
        height,
        draw: () =>
          drawCardOver(
            blobStill(found.palette, blob, { width, height }, blobBackdrop(found.palette)),
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
  // style=blob: the blob's first frame alone, transparent around it as the SVG is unless it asks for a ground
  if (isBlob(params)) {
    const blob = parseBlob(params);
    return answerPicture(
      request,
      env,
      {
        kind: "png",
        branded: false,
        svg: `/${found.seed}.svg${blobSearch(blob, [`size=${width}x${height}`])}`,
        parts: [BLOB_DRAWING, found.seed, blobSearch(blob, [], false), width, height, false],
        width,
        height,
        draw: () =>
          encodePng(width, height, blobStill(found.palette, blob, { width, height }), !blob.bg)
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
