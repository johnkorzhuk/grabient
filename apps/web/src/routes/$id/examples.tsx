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
   first frame is in its first paint (server/glass-still.ts, blob-still.ts) and its players take over in the browser. */
export const Route = createFileRoute("/$id/examples")({
  loaderDeps: ({ search }) => ({ search: drawnSearch(search as Record<string, unknown>) }),
  loader: ({ params, deps }) => {
    const page = readSeedPage(params.id, searchReader(deps.search));
    if (!page) throw notFound();
    const examples: { seed: string; view: View; effect: Effect | null } = {
      seed: page.seed,
      view: page.view,
      effect: page.effect ?? null
    };
    return {
      ...examples,
      /* the frame's bar wears the palette */
      paint: [
        { seed: page.seed, style: page.view.style, steps: page.view.steps, angle: page.view.angle }
      ]
    };
  },
  headers: () => PAGE,
  head: ({ loaderData }) => (loaderData ? pageHead({ kind: "examples", ...loaderData }) : {}),
  /* the hero is the page's light: no water flows from the wordmark behind it */
  staticData: { frame: "app", water: false },
  component: function Examples() {
    const data = Route.useLoaderData();
    return <ExamplesPage seed={data().seed} view={data().view} effect={data().effect} />;
  }
});
