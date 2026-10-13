import { isPagePath } from "@grabient/i18n";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { Placeholder } from "../../app/Placeholder.tsx";
import { NO_STORE } from "../../lib/cache.ts";

/* Every one-segment address: a palette's seed (the editor), a collection's slug, an old grabient.com id, or words
   that lead to a search. The editor draws in the browser alone (`ssr: "data-only"` for a seed), with a static page for
   crawlers; a collection renders whole. */
export const Route = createFileRoute("/$id/")({
  // a name with an extension is a file, and no file is here
  beforeLoad: ({ params }) => {
    if (!isPagePath(`/${params.id}`)) throw notFound();
  },
  headers: () => NO_STORE,
  component: Address
});

function Address() {
  const params = Route.useParams();
  return <Placeholder title={params().id} />;
}
