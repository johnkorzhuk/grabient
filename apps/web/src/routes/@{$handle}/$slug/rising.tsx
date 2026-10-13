import { createFileRoute } from "@tanstack/solid-router";
import { Placeholder } from "../../../app/Placeholder.tsx";
import { NO_STORE } from "../../../lib/cache.ts";

/* An account's collection with its rising palettes first. */
export const Route = createFileRoute("/@{$handle}/$slug/rising")({
  headers: () => NO_STORE,
  component: Rising
});

function Rising() {
  const params = Route.useParams();
  return <Placeholder title={`@${params().handle}/${params().slug}`} />;
}
