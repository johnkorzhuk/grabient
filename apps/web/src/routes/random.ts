import { encodePalette } from "@grabient/engine";
import { randomPalette } from "@grabient/engine/random.ts";
import { parseView } from "@grabient/engine/view.ts";
import { locale, localizePath } from "@grabient/i18n";
import { createFileRoute } from "@tanstack/solid-router";
import { seedAddress } from "../features/editor/address.ts";
import { redirect } from "../lib/responses.ts";

/* A new random palette at the view asked for, in the request's language. Every visit draws another, so no cache keeps
   the answer (server/paths.ts). */
export const Route = createFileRoute("/random")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const url = new URL(request.url);
        const palette = randomPalette();
        const view = parseView(url.searchParams);
        const address = seedAddress({
          seed: encodePalette(palette),
          view: { ...view, steps: Math.max(view.steps, palette.anchors.length) }
        });
        return redirect(new URL(localizePath(address, locale()), url).toString(), 302);
      }
    }
  }
});
