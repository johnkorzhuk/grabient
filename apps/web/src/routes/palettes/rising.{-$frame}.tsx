import { createFileRoute, notFound, redirect } from "@tanstack/solid-router";
import { untrack } from "solid-js";
import { galleryPlace } from "../../features/gallery/address.ts";
import { answerWith, loadPalettes, searchOf } from "../../features/gallery/load.ts";
import { Palettes } from "../../features/gallery/Palettes.tsx";
import { framesQuery } from "../../features/gallery/queries.ts";
import { metaPage } from "../../features/gallery/titles.ts";
import { edgeFor } from "../../lib/cache.ts";
import { isFrame } from "../../lib/orders.ts";
import { pageHead } from "../../lib/page-meta.ts";

type Place = Extract<NonNullable<ReturnType<typeof galleryPlace>>, { kind: "list" }>;
const place = (frame: string | undefined, search: string) =>
  galleryPlace(frame ? `/palettes/rising/${frame}` : "/palettes/rising", search) as Place;

/* Rising: what gained likes lately, in the week's frame at its own address, or three months or a year after it. A
   frame an admin turned off leads to the week's list, for now. */
export const Route = createFileRoute("/palettes/rising/{-$frame}")({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: async ({ params, search, context }) => {
    if (params.frame === undefined) return;
    if (!isFrame(params.frame)) throw notFound();
    const offered = await context.queryClient.ensureQueryData(framesQuery());
    if (!offered.includes(params.frame)) {
      throw redirect({ href: `/palettes/rising${searchOf(search)}`, statusCode: 302 });
    }
  },
  loaderDeps: ({ search }) => ({ query: searchOf(search) }),
  loader: ({ context, params, deps }) =>
    loadPalettes(context.queryClient, place(params.frame, deps.query)),
  headers: ({ loaderData }) => edgeFor(loaderData?.edge ?? 0),
  head: ({ match, params, loaderData }) =>
    pageHead(
      metaPage(place(params.frame, searchOf(match.search)), {
        palettes: loaderData?.palettes,
        robots: loaderData?.robots
      })
    ),
  component: function RisingRoute() {
    const search = Route.useSearch();
    answerWith(untrack(Route.useLoaderData())?.status);
    const params = Route.useParams();
    return <Palettes place={place(params().frame, searchOf(search()))} />;
  }
});
