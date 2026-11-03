/* The fluted glass's still as a picture, which a palette's page paints until the glass plays (server/glass-still.ts):
   the one design at STILL_SIZE square, which every box covers as a background does, drawn by the glass's CPU renderer
   (engine/glass-render.ts, the player's own arithmetic) and coded as WebP (webp.ts). A browser decodes it once and
   scales it, where the still's SVG filter cost a browser that paints without its GPU, as Lighthouse's does, more than
   a second for each tile of the screen, and several at 4K. Its address names what it shows, the key a page's holder
   gives (engine/glass-colors.ts): the ribs' angle, the shape and the colors. Each still is drawn once, within a day of
   its own, about two seconds of CPU, and kept in R2 under cards/ and at the edge (serve.ts). The encoder comes with
   this module, which loads with the first still an isolate is asked for (routes/api/still.ts). */
import { readStillKey } from "@grabient/engine/glass-colors.ts";
import wasm from "@jsquash/webp/codec/enc/webp_enc_simd.wasm";
import { STILL_DRAWING, STILL_QUALITY, STILL_SIZE, stillKeyOf } from "../glass-still.ts";
import { answerPicture, failure, type Keep, type PictureEnv } from "./serve.ts";
import { encodeWebp } from "./webp.ts";

/** /api/still?k=: the glass's still its key names, as WebP. */
export async function stillAnswer(
  request: Request,
  env: PictureEnv,
  keep: Keep
): Promise<Response> {
  const still = readStillKey(stillKeyOf(new URL(request.url).searchParams.get("k") ?? ""));
  if (!still) return failure(404, "No such still");
  const { angle, shape, colors } = still;
  const answer = await answerPicture(
    request,
    env,
    {
      kind: "still",
      type: "webp",
      branded: false,
      kept: "cards",
      day: ["still-day", "stillRenderDaily"],
      parts: [STILL_DRAWING, angle, shape, colors],
      width: STILL_SIZE,
      height: STILL_SIZE,
      draw: async () => {
        const [model, render] = await Promise.all([
          import("@grabient/engine/glass.ts"),
          import("@grabient/engine/glass-render.ts")
        ]);
        const size = { width: STILL_SIZE, height: STILL_SIZE };
        const { geometry, window } = render.glassCover(size, 1, angle, shape);
        /* one frame, drawn without holding the rib map and each pixel's read for frames to come */
        const rgba = render
          .glassRenderer(geometry, window, undefined, true)
          .frame(model.glassField(geometry, colors), 0);
        return encodeWebp(wasm, rgba, STILL_SIZE, STILL_SIZE, STILL_QUALITY);
      }
    },
    keep
  );
  /* the palette's own files are what search engines find of it (its PNG and SVG under its painted picture) */
  answer.headers.set("X-Robots-Tag", "noindex");
  return answer;
}
