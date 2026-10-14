import {
  OAuthAuthorizationServer,
  type OAuthResourceHandler,
  OAuthResourceServer
} from "@cloudflare/workers-oauth-provider";
import { accountRole } from "@grabient/server/auth/roles.ts";
import type { Env } from "@grabient/server/env.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { CLIENT_DOCUMENTS } from "./client-documents.data.ts";
import { type ClientKind, MCP_PATH, MCP_SCOPES, OAUTH_PATHS } from "./clients.ts";

export { AS_METADATA_PATH, OAUTH_PATHS, RESOURCE_METADATA_PATH } from "./clients.ts";

/* Connected apps' OAuth is @cloudflare/workers-oauth-provider: it is the authorization server (metadata,
   registration, client metadata documents, the code exchange, refresh, revocation, token storage in OAUTH_KV) and
   checks every token at /mcp. Grabient writes the routing, the limits, the redirect rule, the authorization page and
   the consent around it (routes.ts and the modules it calls), and never code that issues or checks a token. */

export const YEAR = 365 * 86400;
/** Fourteen days: under the 24.8 days a 32-bit timer in some apps can wait before it refreshes. */
const ACCESS_MAX = 14 * 86400;
/** How long an access token lasts: fourteen days, or the deploy's OAUTH_ACCESS_TTL when it is a whole number of
    seconds from two minutes up to that. A deploy sets it short so that every connected app refreshes many times a
    day, which is how refreshing is watched before a release. */
export const accessSeconds = (env: Pick<Env, "OAUTH_ACCESS_TTL">): number => {
  const asked = Number(env.OAUTH_ACCESS_TTL);
  return Number.isInteger(asked) && asked >= 120 && asked <= ACCESS_MAX ? asked : ACCESS_MAX;
};

/** What a grant carries, written at consent and encrypted by the library. */
export interface GrantProps {
  userId: string;
  app?: string | null;
  host?: string;
  kind?: ClientKind;
}
/** What the MCP handler is given beside the verified token: the grant's props and the account's role, read from the
    database with the call, never kept in the token. */
export interface McpProps extends GrantProps {
  role: "admin" | "user";
}

/* Each server is kept per origin, a few at most: a request under a host of its own (a tunnel, a Preview's branch
   address) is served on that origin, and no stream of hosts may grow what an isolate holds. */
const KEPT = 8;
function kept<T>(cache: Map<string, T>, key: string, make: () => T): T {
  let value = cache.get(key);
  if (!value) {
    if (cache.size >= KEPT) cache.clear();
    value = make();
    cache.set(key, value);
  }
  return value;
}

const servers = new WeakMap<Env, Map<string, OAuthAuthorizationServer<Env>>>();

/** The authorization server for one origin. Every request it sees is rebuilt on that origin, since the library
    matches its endpoints and resources by origin. */
export function authorizationServer(env: Env, origin: string): OAuthAuthorizationServer<Env> {
  let byOrigin = servers.get(env);
  if (!byOrigin) {
    byOrigin = new Map();
    servers.set(env, byOrigin);
  }
  return kept(
    byOrigin,
    origin,
    () =>
      new OAuthAuthorizationServer<Env>({
        issuer: origin,
        resources: [origin + MCP_PATH],
        defaultResource: origin + MCP_PATH,
        authorizeEndpoint: OAUTH_PATHS.authorize,
        tokenEndpoint: OAUTH_PATHS.token,
        clientRegistrationEndpoint: OAUTH_PATHS.register,
        // admin is chosen at consent by an admin, never advertised
        scopesSupported: [...MCP_SCOPES, "offline_access"],
        accessTokenTTL: accessSeconds(env),
        // a year from the code exchange and from each refresh: an app in use never signs in again
        refreshTokenTTL: YEAR,
        refreshTokenIdleTTL: YEAR,
        clientRegistrationTTL: YEAR,
        /* accepted on every deploy: an app connected with a document fails its next refresh once they are not. The
           client-documents flag changes only what the metadata advertises (routes.ts) */
        clientIdMetadataDocumentEnabled: true,
        clientIdMetadataDocuments: CLIENT_DOCUMENTS,
        privateKeyJwt: false,
        allowPrivateUseRedirectUris: false,
        onError: ({ status, internal }) => {
          countUsage(env, "oauth", "error", internal.category, internal.reason, String(status));
        }
      })
  );
}

const resourceServers = new Map<string, OAuthResourceServer<Env, McpProps>>();

/** The MCP server's resource server: its metadata, its challenge and the token check, then `handler`. The library
    checks the token, its audience and its expiry; the account must still exist, and its role is read with each call,
    so a deleted account is refused at once and a role taken away ends the admin tools on the next call. A throw (the
    database down) is the library's 503. */
export function resourceServer(
  origin: string,
  handler: OAuthResourceHandler<Env, McpProps>
): OAuthResourceServer<Env, McpProps> {
  return kept(
    resourceServers,
    origin,
    () =>
      new OAuthResourceServer<Env, McpProps>({
        resourceMetadata: {
          resource: origin + MCP_PATH,
          authorization_servers: [origin],
          resource_name: "Grabient"
        },
        requiredScopes: [...MCP_SCOPES],
        validateToken: env => async (resource, token) => {
          const valid = await authorizationServer(env, origin).validateToken<GrantProps>(
            resource,
            token,
            env
          );
          if (!valid?.userId) return null;
          const role = await accountRole(env, valid.userId);
          if (!role) return null;
          return { ...valid, props: { ...valid.props, role } };
        },
        handler
      })
  );
}

/** What a route has of the Worker's context: a way to finish work after the answer. */
export type Background = Pick<ExecutionContext, "waitUntil">;

/** The context the library's servers are handed, a new object a request: its resource server writes the verified
    token on it, and `more` rides along to the handler. */
export const libraryContext = (ctx: Background, more: object = {}) =>
  ({
    ...more,
    waitUntil: (work: Promise<unknown>) => ctx.waitUntil(work),
    passThroughOnException() {}
  }) as unknown as ExecutionContext;

/** A discovery document as apps may keep it: five minutes, in place of the library's no-store. */
export function discovery(response: Response): Response {
  if (response.status !== 200) return response;
  const out = new Response(response.body, response);
  out.headers.set("Cache-Control", "public, max-age=300");
  out.headers.delete("Pragma");
  return out;
}

/** The origin apps use for this deploy, whichever host a request arrived at (a tunnel, localhost, www). A Preview and
    local development use the request's own. */
export const siteOrigin = (env: Pick<Env, "PUBLIC_ORIGIN">, request?: Request): string =>
  env.PUBLIC_ORIGIN ?? (request ? new URL(request.url).origin : "http://localhost");

/** The request on the site's origin, as the library must see it. */
export function onSiteOrigin(env: Pick<Env, "PUBLIC_ORIGIN">, request: Request): Request {
  const url = new URL(request.url);
  const origin = siteOrigin(env, request);
  return url.origin === origin ? request : new Request(origin + url.pathname + url.search, request);
}
