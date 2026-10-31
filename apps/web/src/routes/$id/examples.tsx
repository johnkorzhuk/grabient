import type { Effect } from "@grabient/engine/effect.ts";
import type { View } from "@grabient/engine/view.ts";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { readSeedPage } from "../../features/editor/address.ts";
import { searchReader } from "../../features/editor/page.ts";
import { ExamplesPage } from "../../features/examples/ExamplesPage.tsx";
import { PAGE } from "../../lib/cache.ts";
import { pageHead } from "../../lib/page-meta.ts";
import { drawnSearch } from "../../lib/route.ts";

/* A palette's examples: the ways it is put to use, in the style its address names (a gradient's, the fluted glass's or
   the blob's), each with the code that does it. Its address is the palette's own plus /examples, with the palette's
   view and effect in the query, as the palette's page takes them. The whole page is drawn on the server; an effect's
   first frame is in its first paint (server/glass-still.ts, blob-still.ts) and its players take over in the browser.
   Its hero runs under the header to the window's top, and the header stands over it in the theme that reads on the
   hero's colors there (features/examples/tone.ts, loaded with the page, so no other page carries it). */
export const Route = createFileRoute("/$id/examples")({
  loaderDeps: ({ search }) => ({ search: drawnSearch(search as Record<string, unknown>) }),
  loader: async ({ params, deps }) => {
    const page = readSeedPage(params.id, searchReader(deps.search));
    if (!page) throw notFound();
    const examples: { seed: string; view: View; effect: Effect | null } = {
      seed: page.seed,
      view: page.view,
      effect: page.effect ?? null
    };
    const { headerTone } = await import("../../features/examples/tone.ts");
    return {
      ...examples,
      /* the frame's bar wears the palette */
      paint: [
        { seed: page.seed, style: page.view.style, steps: page.view.steps, angle: page.view.angle }
      ],
      tone: headerTone({ ...examples, palette: page.palette })
    };
  },
  headers: () => PAGE,
  head: ({ loaderData }) => (loaderData ? pageHead({ kind: "examples", ...loaderData }) : {}),
  /* the hero is the page's light: no water flows from the wordmark behind it, and the header stands over it */
  staticData: { frame: "app", water: false, clear: true },
  component: function Examples() {
    const data = Route.useLoaderData();
    return <ExamplesPage seed={data().seed} view={data().view} effect={data().effect} />;
  }
});
