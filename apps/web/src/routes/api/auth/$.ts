import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { handleAuthRoute } from "../../../server/account/auth.ts";

/* Sign-in: the server package's gate, then the sign-in library. */
export const Route = createFileRoute("/api/auth/$")({
  server: { handlers: { ANY: ({ request }) => handleAuthRoute(request, env) } }
});
