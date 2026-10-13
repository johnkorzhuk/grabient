import { isPagePath } from "@grabient/i18n";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { isCollectionSlug } from "../../features/collections/address.ts";
import { CollectionRoute } from "../../features/collections/CollectionRoute.tsx";
import { collectionHead, loadCollection, searchOf } from "../../features/collections/route.ts";
import { NO_STORE, PAGE } from "../../lib/cache.ts";

/* A collection with its rising palettes first, or words that lead to Rising's search. */
export const Route = createFileRoute("/$id/rising")({
  // a name with an extension is a file, and no file is here; nor is anything that can be no collection's address
  beforeLoad: ({ params }) => {
    if (!isPagePath(`/${params.id}`) || !isCollectionSlug(params.id)) throw notFound();
  },
  loaderDeps: ({ search }) => ({ search: search as Record<string, unknown> }),
  loader: ({ context, params, deps, location }) =>
    loadCollection(context.queryClient, {
      slug: params.id,
      order: "rising",
      searchStr: searchOf(deps.search),
      publicHref: location.publicHref
    }),
  headers: ({ loaderData }) => (loaderData && !loaderData.status ? PAGE : NO_STORE),
  head: ({ match, params, loaderData }) =>
    collectionHead(
      match.context.queryClient,
      { slug: params.id, order: "rising", search: match.search },
      loaderData
    ),
  component: function Rising() {
    const params = Route.useParams();
    const search = Route.useSearch();
    const loaded = Route.useLoaderData();
    return (
      <CollectionRoute
        slug={params().id}
        order="rising"
        search={searchOf(search())}
        loaded={loaded()}
      />
    );
  }
});
