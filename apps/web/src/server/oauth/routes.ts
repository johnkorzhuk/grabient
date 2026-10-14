import type { OAuthAuthorizationServer } from "@cloudflare/workers-oauth-provider";
import { json } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { authorize } from "./authorize.ts";
import { consentAnswer } from "./consent.ts";
import { register, token } from "./endpoints.ts";
import {
  AS_METADATA_PATH,
  authorizationServer,
  type Background,
  discovery,
  libraryContext,
  OAUTH_PATHS,
  onSiteOrigin
} from "./server.ts";

/* The authorization server's addresses: its metadata, registration, the token endpoint (with revocation), the
   authorization page and the consent's answer. Each needs OAUTH_KV alone, so a deploy with no sign-in secret still
   answers what it can. */

/** /oauth/* and /.well-known/oauth-authorization-server. Any other address handed here is not found: the
    protected-resource documents other than the MCP server's own (which serveMcp answers), the root one among them,
    since the challenge names the MCP server's. */
export async function handleOAuth(
  request: Request,
  env: Env,
  background: Background
): Promise<Response> {
  request = onSiteOrigin(env, request);
  const ctx = libraryContext(background);
  const path = new URL(request.url).pathname;
  if (path !== AS_METADATA_PATH && !path.startsWith("/oauth/"))
    return json({ error: "Not found" }, 404);
  if (!env.OAUTH_KV) return json({ error: "Sign-in is unavailable." }, 503);
  const server = authorizationServer(env, new URL(request.url).origin);
  if (path === AS_METADATA_PATH) return metadata(request, env, server, ctx);
  if (path === OAUTH_PATHS.register) return register(request, env, server, ctx);
  if (path === OAUTH_PATHS.token) return token(request, env, server, ctx);
  if (path === OAUTH_PATHS.authorize) return authorize(request, env, server);
  if (path === OAUTH_PATHS.consent) return consentAnswer(request, env, server);
  return json({ error: "Not found" }, 404);
}

/* The library's metadata, kept five minutes, and saying documents are not supported while an admin has the
   client-documents flag off, so a new app registers itself. Documents stay accepted (server.ts), so an app connected
   with one keeps refreshing. */
async function metadata(
  request: Request,
  env: Env,
  server: OAuthAuthorizationServer<Env>,
  ctx: ExecutionContext
): Promise<Response> {
  const answer = await server.fetch(request, env, ctx);
  if (answer.status !== 200) return answer;
  let body: string | null = null;
  if (request.method !== "HEAD") {
    const document = (await answer.json()) as Record<string, unknown>;
    if (await flagOff(env, "client-documents"))
      document.client_id_metadata_document_supported = false;
    body = JSON.stringify(document);
  }
  return discovery(new Response(body, answer));
}
