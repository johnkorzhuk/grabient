import { createFileRoute, notFound, redirect } from "@tanstack/solid-router";
import { createMemo } from "solid-js";
import { ListRoute } from "../../features/collections/ListRoute.tsx";
import type { ListPlace } from "../../features/collections/params.ts";
import { listHead, listPlace, loadList } from "../../features/collections/route.ts";
import { ListAppearance } from "../../features/list/ListAppearance.tsx";
import { FRESH, NO_STORE, PAGE } from "../../lib/cache.ts";
import { DEFAULT_FRAME, isFrame } from "../../lib/orders.ts";
import { drawnSearch, searchOf } from "../../lib/route.ts";

type Params = { order?: string; frame?: string };
/** The public list an address names: Popular, or Rising in a frame; none for an order or a frame the lists lack. */
const placeOf = (params: Params, search: string): ListPlace | null =>
  params.order === undefined
    ? params.frame === undefined
      ? listPlace("popular", undefined, search)
      : null
    : params.order === "rising" && (params.frame === undefined || isFrame(params.frame))
      ? listPlace("rising", params.frame, search)
      : null;

/* The public collections lists, one page that stays as the reader moves between them: Popular (/collections), the
   most saved first, and Rising (/collections/rising) in the week's frame at its own address or a longer one after it.
   Each is searched with `?q=`. A frame an admin turned off leads to the week's. */
export const Route = createFileRoute("/collections/{-$order}/{-$frame}")({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: ({ params, search }) => {
    if (!placeOf(params, "")) throw notFound();
    if (params.frame === DEFAULT_FRAME) {
      throw redirect({
        to: "/collections/{-$order}/{-$frame}",
        params: { order: "rising", frame: undefined },
        search,
        statusCode: 301
      });
    }
  },
  loaderDeps: ({ search }) => ({ search: searchOf(drawnSearch(search)) }),
  loader: ({ context, params, deps, location }) =>
    loadList(
      context.queryClient,
      placeOf(params, deps.search)!,
      // a frame turned off leads to the week's with the selection still open, which the deps leave out
      new URLSearchParams(location.searchStr).has("selection")
    ),
  headers: ({ params, loaderData }) =>
    loaderData?.status || loaderData?.unkept ? NO_STORE : params.order ? FRESH : PAGE,
  head: ({ match, params, loaderData }) =>
    listHead(placeOf(params, searchOf(match.search))!, loaderData),
  staticData: { corner: ListAppearance, translated: true },
  component: function CollectionsLists() {
    const search = Route.useSearch();
    const params = Route.useParams();
    const loaded = Route.useLoaderData();
    /* the page keeps the list it shows while it leaves, once its route's match is gone */
    const place = createMemo<ListPlace | null>(
      kept => (params() && placeOf(params(), searchOf(search()))) || kept || null
    );
    return <ListRoute place={place()!} loaded={loaded()} />;
  }
});
