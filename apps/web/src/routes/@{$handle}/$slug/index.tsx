import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../../../app/Placeholder.tsx";
import { NO_STORE } from "../../../lib/cache.ts";

/* An account's collection: always a collection page, never a search, 404 when nothing is there. */
export const Route = createFileRoute("/@{$handle}/$slug/")({
  headers: () => NO_STORE,
  component: Collection
});

function Collection() {
  const params = Route.useParams();
  return <Placeholder title={`@${params().handle}/${params().slug}`} />;
}
