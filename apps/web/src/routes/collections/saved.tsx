import { createFileRoute } from "@tanstack/solid-router";
import { ListRoute } from "../../features/collections/ListRoute.tsx";
import { listHead, listPlace, searchOf } from "../../features/collections/route.ts";
import { NO_STORE } from "../../lib/cache.ts";

/* The account's own collections: the browser draws them, signed in or not, and the server sends the document alone. */
export const Route = createFileRoute("/collections/saved")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => search,
  headers: () => NO_STORE,
  head: ({ match }) =>
    listHead(
      match.context.queryClient,
      listPlace("saved", undefined, searchOf(match.search)),
      undefined
    ),
  component: function SavedCollections() {
    const search = Route.useSearch();
    return (
      <ListRoute place={listPlace("saved", undefined, searchOf(search()))} loaded={undefined} />
    );
  }
});
