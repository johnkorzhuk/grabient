import { createFileRoute } from "@tanstack/solid-router";
import { galleryPlace } from "../../features/gallery/address.ts";
import { searchOf } from "../../features/gallery/load.ts";
import { Palettes } from "../../features/gallery/Palettes.tsx";
import { title } from "../../features/gallery/titles.ts";
import { NO_STORE } from "../../lib/cache.ts";

type Place = Extract<NonNullable<ReturnType<typeof galleryPlace>>, { kind: "saved" }>;
const place = (search: string) => galleryPlace("/palettes/saved", search) as Place;

/* The account's saved palettes: the browser draws them, signed in or not, and the server sends the document alone. */
export const Route = createFileRoute("/palettes/saved")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => search,
  headers: () => NO_STORE,
  head: ({ match }) => ({
    meta: [
      { title: title(place(searchOf(match.search))) },
      { name: "robots", content: "noindex,nofollow" }
    ]
  }),
  component: function SavedRoute() {
    const search = Route.useSearch();
    return <Palettes place={place(searchOf(search()))} />;
  }
});
