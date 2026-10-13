import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { collectionAnswer } from "../../../server/collections/api.ts";

/* One public collection, its writes and its copies, and the tags under the search (api.ts lists them). */
export const Route = createFileRoute("/api/collections/$")({
  server: { handlers: { ANY: ({ request }) => collectionAnswer(request, env) } }
});
