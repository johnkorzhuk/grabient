import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { uploadAvatar } from "../../../server/account/profile.ts";

export const Route = createFileRoute("/api/settings/avatar")({
  server: { handlers: { ANY: ({ request }) => uploadAvatar(request, env) } }
});
