import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { checkUsername } from "../../../server/account/profile.ts";

export const Route = createFileRoute("/api/settings/username_/check")({
  server: { handlers: { ANY: ({ request }) => checkUsername(request, env) } }
});
