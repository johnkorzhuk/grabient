import { createFileRoute } from "@tanstack/solid-router";
import { untrack } from "solid-js";
import { galleryPlace } from "../features/gallery/address.ts";
import { Home } from "../features/gallery/Home.tsx";
import { answerWith, loadHome, searchOf } from "../features/gallery/load.ts";
import { metaPage } from "../features/gallery/titles.ts";
import { ListAppearance } from "../features/list/ListAppearance.tsx";
import { edgeFor } from "../lib/cache.ts";
import { pageHead } from "../lib/page-meta.ts";

type Place = Extract<NonNullable<ReturnType<typeof galleryPlace>>, { kind: "home" }>;
const place = (search: string) => galleryPlace("/", search) as Place;

/* The home, the Hot feed: `?q=` searches it, `?page=` starts its collections at a later page. */
export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => search,
  loaderDeps: ({ search }) => ({ query: searchOf(search) }),
  loader: ({ context, deps }) => loadHome(context.queryClient, place(deps.query).params),
  headers: ({ loaderData }) => edgeFor(loaderData?.edge ?? 0),
  head: ({ match, loaderData }) =>
    pageHead(
      metaPage(place(searchOf(match.search)), {
        palettes: loaderData?.palettes,
        robots: loaderData?.robots
      })
    ),
  staticData: { corner: ListAppearance },
  component: function HomeRoute() {
    const search = Route.useSearch();
    answerWith(untrack(Route.useLoaderData())?.status);
    return <Home params={place(searchOf(search())).params} />;
  }
});
