import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { confirmDeletion } from "../../../server/account/deletion.ts";

export const Route = createFileRoute("/api/settings/delete-account")({
  server: { handlers: { ANY: ({ request }) => confirmDeletion(request, env) } }
});
