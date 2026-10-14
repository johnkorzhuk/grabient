import { createFileRoute } from "@tanstack/solid-router";
import { untrack } from "solid-js";
import { galleryPlace } from "../../features/gallery/address.ts";
import { answerWith, loadPalettes, searchOf } from "../../features/gallery/load.ts";
import { Palettes } from "../../features/gallery/Palettes.tsx";
import { metaPage } from "../../features/gallery/titles.ts";
import { ListAppearance } from "../../features/list/ListAppearance.tsx";
import { edgeFor } from "../../lib/cache.ts";
import { pageHead } from "../../lib/page-meta.ts";

type Place = Extract<NonNullable<ReturnType<typeof galleryPlace>>, { kind: "list" }>;
const place = (search: string) => galleryPlace("/palettes", search) as Place;

/* Popular: the palettes most liked first, searched with `?q=`. */
export const Route = createFileRoute("/palettes/")({
  validateSearch: (search: Record<string, unknown>) => search,
  loaderDeps: ({ search }) => ({ query: searchOf(search) }),
  loader: ({ context, deps }) => loadPalettes(context.queryClient, place(deps.query)),
  headers: ({ loaderData }) => edgeFor(loaderData?.edge ?? 0),
  head: ({ match, loaderData }) =>
    pageHead(
      metaPage(place(searchOf(match.search)), {
        palettes: loaderData?.palettes,
        robots: loaderData?.robots
      })
    ),
  staticData: { corner: ListAppearance, translated: true },
  component: function PopularRoute() {
    const search = Route.useSearch();
    answerWith(untrack(Route.useLoaderData())?.status);
    return <Palettes place={place(searchOf(search()))} />;
  }
});
