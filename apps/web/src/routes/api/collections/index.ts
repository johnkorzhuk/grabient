import { env, waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { createAnswer, listAnswer } from "../../../server/collections/api.ts";
import { methodNotAllowed } from "../../../server/collections/http.ts";

/* GET a page of the public collections or of a search; POST a new collection of the account's. */
export const Route = createFileRoute("/api/collections/")({
  server: {
    handlers: {
      GET: ({ request }) => listAnswer(request, env, { waitUntil }),
      POST: ({ request }) => createAnswer(request, env),
      ANY: () => methodNotAllowed()
    }
  }
});
