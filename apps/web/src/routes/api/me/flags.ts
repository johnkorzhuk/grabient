import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { handleFlags } from "../../../server/account/flags.ts";

export const Route = createFileRoute("/api/me/flags")({
  server: { handlers: { ANY: ({ request }) => handleFlags(request, env) } }
});
