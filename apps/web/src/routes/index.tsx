import { createFileRoute } from "@tanstack/solid-router";
import { untrack } from "solid-js";
import { galleryPlace } from "../features/gallery/address.ts";
import { Home } from "../features/gallery/Home.tsx";
import { answerWith, loadHome, searchOf } from "../features/gallery/load.ts";
import { title } from "../features/gallery/titles.ts";
import { edgeFor } from "../lib/cache.ts";

const params = (search: Record<string, unknown>) => galleryPlace("/", searchOf(search))!.params;

/* The home, the Hot feed: `?q=` searches it, `?page=` starts its collections at a later page. */
export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => search,
  loaderDeps: ({ search }) => ({ query: searchOf(search) }),
  loader: ({ context, deps }) =>
    loadHome(context.queryClient, galleryPlace("/", deps.query)!.params),
  headers: ({ loaderData }) => edgeFor(loaderData?.edge ?? 0),
  head: ({ match, loaderData }) => ({
    meta: [
      { title: title({ kind: "home", params: params(match.search) }) },
      ...(loaderData?.robots ? [{ name: "robots", content: loaderData.robots }] : [])
    ]
  }),
  component: function HomeRoute() {
    const search = Route.useSearch();
    answerWith(untrack(Route.useLoaderData())?.status);
    return <Home params={params(search())} />;
  }
});
