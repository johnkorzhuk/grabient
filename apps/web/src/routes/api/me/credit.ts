import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/solid-router";
import { creditResponse } from "../../../server/account/credit.ts";

/* GET: whether the account's username shows on the palettes it liked first. PUT {on}: Settings' switch. */
export const Route = createFileRoute("/api/me/credit")({
  server: { handlers: { ANY: ({ request }) => creditResponse(request, env) } }
});
