/* A palette's pictures by address: its share card (/api/og) and its picture alone (/api/png, /{seed}.png), each in the
   view the address asks for. The key names what is drawn, so every address of one picture shares it. */
import { viewAt } from "../files/address.ts";
import type { Resolved } from "../files/resolve.ts";
import { drawCard, drawPicture, keyframeColors, lookOf } from "./paint.ts";
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
      parts: ["palette", found.seed, view.style, view.steps, view.angle, width, height, false],
      width,
      height,
      draw: () => drawPicture(lookOf(found.palette, view), width, height)
    },
    keep
  );
}
