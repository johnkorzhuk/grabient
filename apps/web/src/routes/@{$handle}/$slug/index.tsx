import { createFileRoute, notFound } from "@tanstack/solid-router";
import { isCollectionSlug } from "../../../features/collections/address.ts";
import { CollectionRoute } from "../../../features/collections/CollectionRoute.tsx";
import { collectionHead, loadCollection, searchOf } from "../../../features/collections/route.ts";
import { ListAppearance } from "../../../features/list/ListAppearance.tsx";
import { NO_STORE, PAGE } from "../../../lib/cache.ts";

const slugOf = (params: { handle: string; slug: string }) => `@${params.handle}/${params.slug}`;

/* An account's collection: always a collection page, never a search, 404 when nothing is there. */
export const Route = createFileRoute("/@{$handle}/$slug/")({
  beforeLoad: ({ params }) => {
    if (!isCollectionSlug(slugOf(params))) throw notFound();
  },
  loaderDeps: ({ search }) => ({ search: search as Record<string, unknown> }),
  loader: ({ context, params, deps, location }) =>
    loadCollection(context.queryClient, {
      slug: slugOf(params),
      order: "popular",
      searchStr: searchOf(deps.search),
      publicHref: location.publicHref
    }),
  headers: ({ loaderData }) => (loaderData && !loaderData.status ? PAGE : NO_STORE),
  head: ({ match, params, loaderData }) =>
    collectionHead(
      match.context.queryClient,
      { slug: slugOf(params), order: "popular", search: match.search },
      loaderData
    ),
  staticData: { corner: ListAppearance },
  component: function Collection() {
    const params = Route.useParams();
    const search = Route.useSearch();
    const loaded = Route.useLoaderData();
    return (
      <CollectionRoute
        slug={slugOf(params())}
        order="popular"
        search={searchOf(search())}
        loaded={loaded()}
      />
    );
  }
});
