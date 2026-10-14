import { createFileRoute } from "@tanstack/solid-router";
import { ListRoute } from "../../features/collections/ListRoute.tsx";
import { listHead, listPlace, loadList, searchOf } from "../../features/collections/route.ts";
import { ListAppearance } from "../../features/list/ListAppearance.tsx";
import { NO_STORE, PAGE } from "../../lib/cache.ts";

/* Popular collections: the most saved first, searched with `?q=`. */
export const Route = createFileRoute("/collections/")({
  validateSearch: (search: Record<string, unknown>) => search,
  loaderDeps: ({ search }) => ({ search: searchOf(search) }),
  loader: ({ context, deps }) =>
    loadList(context.queryClient, listPlace("popular", undefined, deps.search)),
  headers: ({ loaderData }) => (loaderData?.status ? NO_STORE : PAGE),
  head: ({ match, loaderData }) =>
    listHead(
      match.context.queryClient,
      listPlace("popular", undefined, searchOf(match.search)),
      loaderData
    ),
  staticData: { corner: ListAppearance, translated: true },
  component: function PopularCollections() {
    const search = Route.useSearch();
    const loaded = Route.useLoaderData();
    return (
      <ListRoute place={listPlace("popular", undefined, searchOf(search()))} loaded={loaded()} />
    );
  }
});
