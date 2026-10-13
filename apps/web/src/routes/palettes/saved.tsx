import { createFileRoute } from "@tanstack/solid-router";
import { galleryPlace } from "../../features/gallery/address.ts";
import { searchOf } from "../../features/gallery/load.ts";
import { Palettes } from "../../features/gallery/Palettes.tsx";
import { metaPage } from "../../features/gallery/titles.ts";
import { ListAppearance } from "../../features/list/ListAppearance.tsx";
import { NO_STORE } from "../../lib/cache.ts";
import { pageHead } from "../../lib/page-meta.ts";

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
    return <Palettes place={place(searchOf(search()))} />;
  }
});
