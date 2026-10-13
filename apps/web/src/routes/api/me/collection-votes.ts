import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { votesBySlugAnswer } from "../../../server/collections/me.ts";

/* The reader's fit votes on a list's page of collections. */
export const Route = createFileRoute("/api/me/collection-votes")({
  server: { handlers: { ANY: ({ request }) => votesBySlugAnswer(request, env) } }
});
