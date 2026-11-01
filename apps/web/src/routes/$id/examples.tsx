import { createFileRoute, notFound, redirect } from "@tanstack/solid-router";
import { readSeedPage } from "../../features/editor/address.ts";
import { searchReader } from "../../features/editor/page.ts";
import { ExamplesPage } from "../../features/examples/ExamplesPage.tsx";
import { PAGE } from "../../lib/cache.ts";
import { pageHead } from "../../lib/page-meta.ts";
import { drawnSearch } from "../../lib/route.ts";

/* A palette's examples: the ways it is put to use, each part in a look its seed picks (features/examples/looks.ts), each
   with the code that does it. One page for each palette at the palette's address plus /examples: an address naming a
   view or an effect, as the editor's sheet once linked, moves there for good. The whole page is drawn on the server; an
   effect's first frame is in its first paint (server/glass-still.ts, blob-still.ts) and its players take over in the
   browser. Its hero runs under the header to the window's top, the header frosted over it until the page scrolls. */
export const Route = createFileRoute("/$id/examples")({
  loaderDeps: ({ search }) => ({ search: drawnSearch(search as Record<string, unknown>) }),
  loader: async ({ params, deps }) => {
    if (Object.keys(deps.search).length)
      throw redirect({ to: "/$id/examples", params, search: {}, statusCode: 301 });
    const page = readSeedPage(params.id, searchReader({}));
    if (!page) throw notFound();
    /* the hero's look, from a module of its own: the route's start carries none of the page */
    const { heroView } = await import("../../features/examples/hero.ts");
    const view = heroView(page.seed, page.palette);
    return {
      seed: page.seed,
      view,
      /* the frame's bar wears the palette as the hero does */
      paint: [{ seed: page.seed, style: view.style, steps: view.steps, angle: view.angle }]
    };
  },
  headers: () => PAGE,
  head: ({ loaderData }) =>
    loaderData ? pageHead({ kind: "examples", seed: loaderData.seed, view: loaderData.view }) : {},
  /* the hero is the page's light: no water flows from the wordmark behind it, and the header stands over it */
  staticData: { frame: "app", water: false, clear: true },
  component: function Examples() {
    const data = Route.useLoaderData();
    return <ExamplesPage seed={data().seed} />;
  }
});
