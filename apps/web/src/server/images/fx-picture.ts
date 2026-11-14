/* The vector effects' stills as pictures (engine/fx-picture.ts, EFFECT_KINDS' picture: the aurora's), which a page's
   first screen (server/fx-still.ts) and a list's cards (FxArt.tsx) show in place of their vector still: the still's
   first frame in the design square, drawn by the effect's CPU drawing (engine/fx-picture-draw.ts) and coded as WebP
   (webp.ts). Its address names the still a page's holder names (engine/effect.ts fxStillKey). Each is drawn once,
   within a day of its own, about half a second of CPU (the aurora's drawing at 1024 about 0.28 s, its coding 0.21),
   and kept in R2 under cards/ and at the edge (serve.ts). The drawing and the encoder come with this module, which
   loads with the first picture an isolate is asked for (routes/api/fx-still.ts). */
import { decodePalette } from "@grabient/engine/codec.ts";
import { hasPicture } from "@grabient/engine/effect.ts";
import {
  FX_PICTURE_METHOD,
  FX_PICTURE_QUALITY,
  FX_PICTURE_SIDE,
  FX_PICTURE_VERSION,
  fxPictureAddress,
  fxPictureOf
} from "@grabient/engine/fx-picture.ts";
import { readFxStillKey } from "@grabient/engine/fx-still.ts";
import wasm from "@jsquash/webp/codec/enc/webp_enc_simd.wasm";
import { answerPicture, failure, type Keep, type PictureEnv } from "./serve.ts";
import { encodeWebp } from "./webp.ts";

/** /api/fx-still?k=: the picture of the still its key names, as WebP: a look drawn as a picture
    (engine/fx-picture.ts fxPictureOf), its ground none, which a page lays under it as a color. Any other look is no
    picture, so the pictures the server draws and keeps are one a palette. */
export async function fxPictureAnswer(
  request: Request,
  env: PictureEnv,
  keep: Keep
): Promise<Response> {
  const key = new URL(request.url).searchParams.get("k") ?? "";
  const named = readFxStillKey(key);
  const P = named && hasPicture(named.kind) ? decodePalette(named.seed) : null;
  const drawn = named && fxPictureOf(named.kind, named.seed, named.look);
  if (!named || !hasPicture(named.kind) || !P || drawn?.address !== fxPictureAddress(key))
    return failure(404, "No such still");
  const { kind, look } = named;
  const answer = await answerPicture(
    request,
    env,
    {
      kind: "still",
      type: "webp",
      branded: false,
      kept: "cards",
      day: ["fx-still-day", "fxStillRenderDaily"],
      parts: [
        `fx-picture-${FX_PICTURE_VERSION}`,
        key,
        FX_PICTURE_SIDE,
        FX_PICTURE_QUALITY,
        FX_PICTURE_METHOD
      ],
      failed: "Effect still picture render failed",
      width: FX_PICTURE_SIDE,
      height: FX_PICTURE_SIDE,
      draw: async () => {
        const { fxPicturePixels } = await import("@grabient/engine/fx-picture-draw.ts");
        const rgba = fxPicturePixels(kind, P, look, FX_PICTURE_SIDE);
        return encodeWebp(
          wasm,
          rgba,
          FX_PICTURE_SIDE,
          FX_PICTURE_SIDE,
          FX_PICTURE_QUALITY,
          FX_PICTURE_METHOD
        );
      }
    },
    keep
  );
  /* the palette's own files are what search engines find of it (its PNG and SVG under its painted picture) */
  answer.headers.set("X-Robots-Tag", "noindex");
  return answer;
}
