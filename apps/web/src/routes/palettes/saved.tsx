import { createFileRoute } from "@tanstack/solid-router";
import { createMemo } from "solid-js";
import { galleryPlace } from "../../features/gallery/address.ts";
import { Palettes } from "../../features/gallery/Palettes.tsx";
import { metaPage } from "../../features/gallery/titles.ts";
import { ListAppearance } from "../../features/list/ListAppearance.tsx";
import { NO_STORE } from "../../lib/cache.ts";
import { pageHead } from "../../lib/page-meta.ts";
import { searchOf } from "../../lib/route.ts";

type Place = Extract<NonNullable<ReturnType<typeof galleryPlace>>, { kind: "saved" }>;
const place = (search: string) => galleryPlace("/palettes/saved", search) as Place;

/* The account's saved palettes: the browser draws them, signed in or not, and the server sends the document alone. */
export const Route = createFileRoute("/palettes/saved")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => search,
  headers: () => NO_STORE,
  head: ({ match }) => pageHead(metaPage(place(searchOf(match.search)))),
  staticData: { corner: ListAppearance },
  component: function SavedRoute() {
    const search = Route.useSearch();
    /* read once an address: the page and every card on it read the place, which a prop would read the address for */
    const at = createMemo(() => place(searchOf(search())));
    return <Palettes place={at()} />;
  }
});
