import { isPagePath } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { Loading, lazy, Show, untrack } from "solid-js";
import { Placeholder } from "../../app/Placeholder.tsx";
import { SEED_SHAPE } from "../../features/editor/address.ts";
import { EditorCorner } from "../../features/editor/EditorCorner.tsx";
import { loadEditor, paletteData, paletteHead } from "../../features/editor/page.ts";
import { StaticPalette } from "../../features/editor/StaticPalette.tsx";
import { NO_STORE, PALETTE_PAGE } from "../../lib/cache.ts";

/* Every one-segment address: a palette's seed (the editor), a collection's slug, an old grabient.com id, or words
   that lead to a search. A palette's page is the editor, which the browser draws alone: the server runs the loader,
   for the head and for the static page crawlers and readers without JavaScript read, which the editor takes the place
   of. A collection renders whole. */
const Editor = lazy(loadEditor);

export const Route = createFileRoute("/$id/")({
  // a name with an extension is a file, and no file is here
  beforeLoad: ({ params }) => {
    if (!isPagePath(`/${params.id}`)) throw notFound();
  },
  ssr: ({ params }) =>
    params.status === "success" && SEED_SHAPE.test(params.value.id) ? "data-only" : true,
  // the view rides the address: a palette's page is read again as it changes, from the address alone
  loaderDeps: ({ search }) => ({ search: search as Record<string, unknown> }),
  loader: async ({ params, deps }) => ({ palette: await paletteData(params.id, deps.search) }),
  headers: ({ loaderData }) => (loaderData?.palette ? PALETTE_PAGE : NO_STORE),
  head: ({ loaderData }) => (loaderData?.palette ? paletteHead(loaderData.palette) : {}),
  staticData: { frame: "app", corner: EditorCorner, strip: true },
  pendingComponent: Static,
  /* the static page is no spinner that must not flash: the editor takes its place the moment it can */
  pendingMinMs: 0,
  component: Address
});

/* what the server sends for a palette, and what stands while the editor's code arrives, which the browser asks for
   as it starts the page rather than once the page has started */
function Static() {
  const data = Route.useLoaderData();
  if (!isServer && untrack(() => data()?.palette)) void loadEditor();
  return <Show when={data()?.palette}>{palette => <StaticPalette data={palette()} />}</Show>;
}

function Address() {
  const params = Route.useParams();
  const data = Route.useLoaderData();
  return (
    <Show when={data().palette} fallback={<Placeholder title={params().id} />}>
      {palette => (
        <Loading fallback={<StaticPalette data={palette()} />}>
          <Editor data={palette()} />
        </Loading>
      )}
    </Show>
  );
}
