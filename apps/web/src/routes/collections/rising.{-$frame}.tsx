import { createFileRoute, notFound, redirect } from "@tanstack/solid-router";
import { ListRoute } from "../../features/collections/ListRoute.tsx";
import { listHead, listPlace, loadList } from "../../features/collections/route.ts";
import { ListAppearance } from "../../features/list/ListAppearance.tsx";
import { FRESH, NO_STORE } from "../../lib/cache.ts";
import { DEFAULT_FRAME, isFrame } from "../../lib/orders.ts";
import { searchOf } from "../../lib/route.ts";

/* Rising over the week is the list's own address; its longer frames are a last segment of their own. A frame an admin
   turned off leads to the week's. */
export const Route = createFileRoute("/collections/rising/{-$frame}")({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: ({ params, search }) => {
    if (params.frame === DEFAULT_FRAME) {
      throw redirect({
        to: "/collections/rising/{-$frame}",
        params: { frame: undefined },
        search,
        statusCode: 301
      });
    }
    if (params.frame !== undefined && !isFrame(params.frame)) throw notFound();
  },
  loaderDeps: ({ search }) => ({ search: searchOf(search) }),
  loader: ({ context, params, deps }) =>
    loadList(context.queryClient, listPlace("rising", params.frame, deps.search)),
  headers: ({ loaderData }) => (loaderData?.status ? NO_STORE : FRESH),
  head: ({ match, params, loaderData }) =>
    listHead(
      match.context.queryClient,
      listPlace("rising", params.frame, searchOf(match.search)),
      loaderData
    ),
  staticData: { corner: ListAppearance, translated: true },
  component: function RisingCollections() {
    const search = Route.useSearch();
    const params = Route.useParams();
    const loaded = Route.useLoaderData();
    return (
      <ListRoute
        place={listPlace("rising", params().frame, searchOf(search()))}
        loaded={loaded()}
      />
    );
  }
});
