/* A palette's animated blob as a script any page embeds: `<script src="/{seed}.js?style=blob&fill=1"></script>`. The
   script (src/embed/blob.ts, built into one by src/embed/build.ts) is the same for every palette and reads the palette
   and the blob's options from its own address, so this answers it for any name that is a palette and a 404 for any
   other. It changes with each build, so the edge keeps it for a build (keys.ts) and a browser an hour. The script is
   read when one is first asked for, so no other request's Worker starts with it. */
import { ANIMATION } from "../../lib/cache.ts";
import { json } from "../../lib/responses.ts";
import { fileName } from "./address.ts";
import { resolvePalette } from "./resolve.ts";

export async function embedAnswer(request: Request, _env: unknown): Promise<Response> {
  const name = fileName(new URL(request.url).pathname, "js");
  if (!resolvePalette(name)) return json({ error: "Invalid palette seed." }, { status: 404 });
  const { default: script } = await import("virtual:blob-embed");
  return new Response(script, {
    headers: {
      ...ANIMATION,
      "Content-Type": "text/javascript; charset=utf-8",
      "X-Robots-Tag": "noindex",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
