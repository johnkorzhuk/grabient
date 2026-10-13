import { isPagePath } from "@grabient/i18n";
import { createFileRoute, notFound } from "@tanstack/solid-router";
import { Placeholder } from "../../app/Placeholder.tsx";
import { NO_STORE } from "../../lib/cache.ts";

/* A collection with its rising palettes first, or words that lead to Rising's search. */
export const Route = createFileRoute("/$id/rising")({
  // a name with an extension is a file, and no file is here
  beforeLoad: ({ params }) => {
    if (!isPagePath(`/${params.id}`)) throw notFound();
  },
  headers: () => NO_STORE,
  component: Rising
});

function Rising() {
  const params = Route.useParams();
  return <Placeholder title={params().id} />;
}
