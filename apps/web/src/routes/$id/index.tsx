import { isPagePath } from "@grabient/i18n";
import { isServer } from "@solidjs/web";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { Loading, lazy, Match, Show, Switch, untrack } from "solid-js";
import { Placeholder } from "../../app/Placeholder.tsx";
import { isCollectionSlug } from "../../features/collections/address.ts";
import { CollectionRoute } from "../../features/collections/CollectionRoute.tsx";
import { collectionHead, loadCollection, searchOf } from "../../features/collections/route.ts";
import { SEED_SHAPE } from "../../features/editor/address.ts";
import { EditorCorner } from "../../features/editor/EditorCorner.tsx";
import { loadEditor, paletteData, paletteHead } from "../../features/editor/page.ts";
import { StaticPalette } from "../../features/editor/StaticPalette.tsx";
import { NO_STORE, PAGE, PALETTE_PAGE } from "../../lib/cache.ts";

/* Every one-segment address: a palette's seed (the editor), a collection's slug, an old grabient.com id, or words
   that lead to a search. A palette's page is the editor, which the browser draws alone (`ssr: "data-only"` for a
   seed): the server runs the loader, for the head and for the static page crawlers and readers without JavaScript
   read, which the editor takes the place of. A collection renders whole. The collections' loader decides a slug: the
   collection there, the 404 page of a private one, or the palette search for its words. */
const Editor = lazy(loadEditor);

export const Route = createFileRoute("/$id/")({
  // a name with an extension is a file, and no file is here
  beforeLoad: ({ params }) => {
    if (!isPagePath(`/${params.id}`)) throw notFound();
  },
  ssr: ({ params }) =>
    params.status === "success" && SEED_SHAPE.test(params.value.id) ? "data-only" : true,
  // the view rides the address: a page is read again as it changes, from the address alone
  loaderDeps: ({ search }) => ({ search: search as Record<string, unknown> }),
  loader: async ({ context, params, deps, location }) => {
    const palette = await paletteData(params.id, deps.search);
    const collection =
      !palette && isCollectionSlug(params.id)
        ? await loadCollection(context.queryClient, {
            slug: params.id,
            order: "popular",
            searchStr: searchOf(deps.search),
            publicHref: location.publicHref
          })
        : null;
    return { palette, collection };
  },
  headers: ({ loaderData }) => {
    if (loaderData?.palette) return PALETTE_PAGE;
    return loaderData?.collection && !loaderData.collection.status ? PAGE : NO_STORE;
  },
  head: ({ match, params, loaderData }) => {
    if (loaderData?.palette) return paletteHead(loaderData.palette);
    if (!loaderData?.collection) return {};
    return collectionHead(
      match.context.queryClient,
      { slug: params.id, order: "popular", search: match.search },
      loaderData.collection
    );
  },
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
  const search = Route.useSearch();
  const data = Route.useLoaderData();
  return (
    <Switch fallback={<Placeholder title={params().id} />}>
      <Match when={data().palette}>
        {palette => (
          <Loading fallback={<StaticPalette data={palette()} />}>
            <Editor data={palette()} />
          </Loading>
        )}
      </Match>
      <Match when={data().collection}>
        {loaded => (
          <CollectionRoute
            slug={params().id}
            order="popular"
            search={searchOf(search())}
            loaded={loaded()}
          />
        )}
      </Match>
    </Switch>
  );
}
