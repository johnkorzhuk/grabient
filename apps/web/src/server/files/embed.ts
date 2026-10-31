/* A palette's fluted glass or blob as a script any page embeds: `<script src="/{seed}.js?style=glass" async>`. The
   script (src/embed, built into one for each effect by src/embed/build.ts) is the same for every palette and reads
   the palette and the effect from its own address, so this answers it for any seed with a style that is an effect,
   and a 404 for any other address. It changes with each build, so the edge keeps it for a build (keys.ts) and a
   browser an hour. The scripts are files of the deploy's static assets (src/embed/build.ts), read through the
   ASSETS binding, so they are no part of the Worker's code. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { parseEffect } from "@grabient/engine/effect.ts";
import { ANIMATION, EMBEDDED } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { type AssetsEnv, asset } from "../assets.ts";
import { addressParams, fileName } from "./address.ts";

export async function embedAnswer(request: Request, env: AssetsEnv): Promise<Response> {
  const url = new URL(request.url);
  /* the script reads its palette from its own address, so the name must be a seed itself, not an old id */
  const seed = fileName(url.pathname, "js");
  const effect = parseEffect(addressParams(url.searchParams));
  if (!decodePalette(seed) || !effect) {
    return json(
      { error: "A palette's seed and style=glass or style=blob name an effect's script." },
      { status: 404 }
    );
  }
  const script = await asset(env, __EFFECT_EMBEDS__[effect.kind]);
  return new Response(script.body, {
    headers: { ...ANIMATION, ...EMBEDDED, "Content-Type": "text/javascript; charset=utf-8" }
  });
}
