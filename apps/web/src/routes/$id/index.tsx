import { isPagePath } from "@grabient/i18n";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { Show } from "solid-js";
import { Placeholder } from "../../app/Placeholder.tsx";
import { isCollectionSlug } from "../../features/collections/address.ts";
import { CollectionRoute } from "../../features/collections/CollectionRoute.tsx";
import { collectionHead, loadCollection, searchOf } from "../../features/collections/route.ts";
import { NO_STORE, PAGE } from "../../lib/cache.ts";

/* Every one-segment address: a palette's seed (the editor), a collection's slug, an old grabient.com id, or words
   that lead to a search. The editor draws in the browser alone (`ssr: "data-only"` for a seed), with a static page for
   crawlers; a collection renders whole. The collections' loader decides a slug: the collection there, the 404 page of
   a private one, or the palette search for its words. */
export const Route = createFileRoute("/$id/")({
  // a name with an extension is a file, and no file is here
  beforeLoad: ({ params }) => {
    if (!isPagePath(`/${params.id}`)) throw notFound();
  },
  loaderDeps: ({ search }) => ({ search: search as Record<string, unknown> }),
  loader: async ({ context, params, deps, location }) => ({
    collection: isCollectionSlug(params.id)
      ? await loadCollection(context.queryClient, {
          slug: params.id,
          order: "popular",
          searchStr: searchOf(deps.search),
          publicHref: location.publicHref
        })
      : null
  }),
  headers: ({ loaderData }) =>
    loaderData?.collection && !loaderData.collection.status ? PAGE : NO_STORE,
  head: ({ match, params, loaderData }) =>
    loaderData?.collection
      ? collectionHead(
          match.context.queryClient,
          { slug: params.id, order: "popular", search: match.search },
          loaderData.collection
        )
      : {},
  component: Address
});

function Address() {
  const params = Route.useParams();
  const search = Route.useSearch();
  const data = Route.useLoaderData();
  return (
    <Show when={data().collection} fallback={<Placeholder title={params().id} />}>
      {loaded => (
        <CollectionRoute
          slug={params().id}
          order="popular"
          search={searchOf(search())}
          loaded={loaded()}
        />
      )}
    </Show>
  );
}
