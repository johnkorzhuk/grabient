import { createFileRoute, notFound, redirect } from "@tanstack/solid-router";
import { untrack } from "solid-js";
import { galleryPlace } from "../../features/gallery/address.ts";
import { loadPalettes } from "../../features/gallery/load.ts";
import { Palettes } from "../../features/gallery/Palettes.tsx";
import { framesQuery } from "../../features/gallery/queries.ts";
import { metaPage } from "../../features/gallery/titles.ts";
import { ListAppearance } from "../../features/list/ListAppearance.tsx";
import { edgeFor } from "../../lib/cache.ts";
import { DEFAULT_FRAME } from "../../lib/orders.ts";
import { pageHead } from "../../lib/page-meta.ts";
import { answerWith, drawnSearch, searchOf } from "../../lib/route.ts";

type Place = Extract<NonNullable<ReturnType<typeof galleryPlace>>, { kind: "list" }>;
/** The public list an address names; none for an order or a frame the lists do not have. */
function place(params: { order?: string; frame?: string }, search: string): Place | null {
  const path = ["/palettes", params.order, params.frame].filter(Boolean).join("/");
  const at = galleryPlace(path, search);
  return at?.kind === "list" ? at : null;
}

/* The public palette lists, one page that stays as the reader moves between them: Popular (/palettes), the most
   liked first, and Rising (/palettes/rising), what gained likes lately, in the week's frame at its own address or
   three months or a year after it. Each is searched with `?q=`. A frame an admin turned off leads to the week's list,
   for now. */
export const Route = createFileRoute("/palettes/{-$order}/{-$frame}")({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: async ({ params, search, context }) => {
    const at = place(params, "");
    if (!at) throw notFound();
    if (at.frame === DEFAULT_FRAME) return;
    const offered = await context.queryClient.ensureQueryData(framesQuery());
    if (!offered.includes(at.frame)) {
      throw redirect({ href: `/palettes/rising${searchOf(search)}`, statusCode: 302 });
    }
  },
  loaderDeps: ({ search }) => ({ query: searchOf(drawnSearch(search)) }),
  loader: ({ context, params, deps }) =>
    loadPalettes(context.queryClient, place(params, deps.query)!),
  headers: ({ loaderData }) => edgeFor(loaderData?.edge ?? 0),
  head: ({ match, params, loaderData }) => {
    const at = place(params, searchOf(match.search));
    return at
      ? pageHead(metaPage(at, { palettes: loaderData?.palettes, robots: loaderData?.robots }))
      : {};
  },
  staticData: { corner: ListAppearance, translated: true },
  component: function PalettesRoute() {
    const search = Route.useSearch();
    const params = Route.useParams();
    answerWith(untrack(Route.useLoaderData())?.status);
    return <Palettes place={place(params(), searchOf(search()))!} />;
  }
});
