import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { saveUsername } from "../../../server/account/profile.ts";

export const Route = createFileRoute("/api/settings/username")({
  server: { handlers: { ANY: ({ request }) => saveUsername(request, env) } }
});
