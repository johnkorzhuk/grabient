/* A palette's pictures: its share card (/api/og) and its picture alone (/api/png, /{seed}.png), each in the view the
   address asks for, and the head an email wears. The key names what is drawn, so every address of one picture shares
   it. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { hexBytes } from "@grabient/engine/color.ts";
import { viewSearch } from "@grabient/engine/view.ts";
import { MARK_FIXED } from "@grabient/ui/mark.ts";
import { type Saved, viewAt } from "../files/address.ts";
import type { Resolved } from "../files/resolve.ts";
import { drawCard, drawPicture, keyframeColors, type Look, lookOf } from "./paint.ts";
import { answerPicture, type Keep, type PictureEnv } from "./serve.ts";
import { cardSize, pictureSize } from "./size.ts";

/** The palette a share card shows when its address names none. */
export const DEFAULT_SEED = "kS7Q8Yy5S_SChv0";

export function paletteCard(
  request: Request,
  env: PictureEnv,
  found: Resolved,
  params: URLSearchParams,
  keep: Keep
): Promise<Response> {
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
  const view = viewAt(params, found.palette.anchors.length);
  const { width, height } = pictureSize(params);
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
