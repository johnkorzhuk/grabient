/* A palette's effect (engine/effect.ts's EFFECTS, each with a script) as a script any page embeds:
   `<script src="/{seed}.js?style=glass" async>`. The script (src/embed, built into one for each effect by
   src/embed/build.ts) is the same for every palette and reads the palette, the effect and its soft and grain from its
   own address, so this answers it for any seed with a style that is an effect with a script, and a 404 for any other
   address. It changes with each build, so the edge keeps it for a build (keys.ts) and a browser an hour. The scripts
   are files of the deploy's static assets (src/embed/build.ts), read through the ASSETS binding, so they are no part
   of the Worker's code. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { EFFECTS, type EffectKind, hasEmbedScript, parseEffect } from "@grabient/engine/effect.ts";
import { ANIMATION, EMBEDDED } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { type AssetsEnv, asset } from "../assets.ts";
import { addressParams, fileName } from "./address.ts";

/* each script's file in the deploy's assets, by its effect */
const SCRIPTS: Partial<Record<EffectKind, string>> = __EFFECT_EMBEDS__;
/* the styles a script is asked for by, as the effects that have one name them: "style=a, style=b or style=c" */
const SCRIPTED_STYLES = EFFECTS.filter(hasEmbedScript)
  .map(kind => `style=${kind}`)
  .join(", ")
  .replace(/, ([^,]+)$/, " or $1");

export async function embedAnswer(request: Request, env: AssetsEnv): Promise<Response> {
  const url = new URL(request.url);
  /* the script reads its palette from its own address, so the name must be a seed itself, not an old id */
  const seed = fileName(url.pathname, "js");
  const kind = parseEffect(addressParams(url.searchParams))?.kind;
  const path = kind && hasEmbedScript(kind) ? SCRIPTS[kind] : undefined;
  if (!decodePalette(seed) || !path) {
    return json(
      {
        error: `A palette's seed and ${SCRIPTED_STYLES} name an effect's script.`
      },
      { status: 404 }
    );
  }
  const script = await asset(env, path);
  return new Response(script.body, {
    headers: { ...ANIMATION, ...EMBEDDED, "Content-Type": "text/javascript; charset=utf-8" }
  });
}
