import { createFileRoute } from "@tanstack/solid-router";
import { ListRoute } from "../../features/collections/ListRoute.tsx";
import { listHead, listPlace, loadSaved, searchOf } from "../../features/collections/route.ts";
import { ListAppearance } from "../../features/list/ListAppearance.tsx";
import { NO_STORE } from "../../lib/cache.ts";

/* The account's own collections. The server draws the page around them, and the way in for a reader with no session;
   the collections themselves are the browser's to read, from the account's copy or the server. No cache keeps it. */
export const Route = createFileRoute("/collections/saved")({
  validateSearch: (search: Record<string, unknown>) => search,
  loader: ({ context }) => loadSaved(context.queryClient),
  headers: () => NO_STORE,
  head: ({ match }) => listHead(listPlace("saved", undefined, searchOf(match.search)), undefined),
  staticData: { corner: ListAppearance },
  component: function SavedCollections() {
    const search = Route.useSearch();
    const loaded = Route.useLoaderData();
    return (
      <ListRoute place={listPlace("saved", undefined, searchOf(search()))} loaded={loaded()} />
    );
  }
});
