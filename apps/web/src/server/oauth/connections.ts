import type { GrantSummary } from "@cloudflare/workers-oauth-provider";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { type ClientKind, clientKind, givenName, type Place, redirectPlace } from "./clients.ts";
import { authorizationServer, siteOrigin, YEAR } from "./server.ts";

/* The apps an account allowed, as Settings and the MCP page list them, and the ways they end: Disconnect, and the
   account's deletion. */

/** An app the account allowed: one row per app, however many machines or sessions hold it. */
export interface Connection {
  clientId: string;
  /** the name the app's document or the app itself gave, or null for one that gave none: the page says so */
  name: string | null;
  /** the host that published the app's document, for a saved or fetched one; null for a registered app */
  verifiedHost: string | null;
  scopes: string[];
  connectedAt: number;
  returnsTo: Place;
  /** the app's grants used in the last 30 days, at least 1 */
  sessions: number;
}

const GRANTS_LISTED = 500;
const SESSION_DAYS = 30;

async function userGrants(
  env: Env,
  origin: string,
  userId: string,
  max = Number.POSITIVE_INFINITY
): Promise<GrantSummary[]> {
  if (!env.OAUTH_KV) return [];
  const api = authorizationServer(env, origin).getOAuthApi(env);
  const grants: GrantSummary[] = [];
  let cursor: string | undefined;
  do {
    const page = await api.listUserGrants(userId, {
      limit: Math.min(1000, max - grants.length),
      cursor
    });
    grants.push(...page.items);
    cursor = page.cursor;
  } while (cursor && grants.length < max);
  return grants;
}

/** The apps an account allowed and has not disconnected, newest first. A KV list can lag a minute behind a write. */
export async function listConnections(
  env: Env,
  origin: string,
  userId: string,
  now = Date.now()
): Promise<Connection[]> {
  const byClient = new Map<string, GrantSummary[]>();
  for (const grant of await userGrants(env, origin, userId, GRANTS_LISTED)) {
    byClient.set(grant.clientId, [...(byClient.get(grant.clientId) ?? []), grant]);
  }
  /* a refresh moves a grant's end a year ahead, so its last use is that end less a year: a grant a reconnect left
     behind leaves the count within a month, while an app in use refreshes at least every 14 days */
  const lastUse = (grant: GrantSummary) =>
    Math.max(grant.createdAt, (grant.expiresAt ?? 0) - YEAR) * 1000;
  return [...byClient]
    .map(([clientId, held]) => {
      const newest = held.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
      const meta = (newest.metadata ?? {}) as {
        name?: string | null;
        host?: string;
        kind?: ClientKind;
      };
      const kind = meta.kind ?? clientKind(clientId);
      return {
        clientId,
        name: givenName(meta.name),
        verifiedHost: kind === "registered" ? null : (meta.host ?? null),
        scopes: [...new Set(held.flatMap(grant => grant.scope))].filter(
          scope => scope !== "offline_access"
        ),
        connectedAt: newest.createdAt * 1000,
        returnsTo: redirectPlace(newest.redirectUri ?? ""),
        sessions: Math.max(
          1,
          held.filter(grant => lastUse(grant) >= now - SESSION_DAYS * 86_400_000).length
        )
      };
    })
    .sort((a, b) => b.connectedAt - a.connectedAt);
}

/** Every grant an app holds for the account, on every machine, with its tokens. Another location may accept one of
    its tokens for up to a minute, KV's read cache. Whether any grant was found. */
export async function disconnect(
  env: Env,
  origin: string,
  userId: string,
  clientId: string
): Promise<boolean> {
  const api = authorizationServer(env, origin).getOAuthApi(env);
  const held = (await userGrants(env, origin, userId)).filter(grant => grant.clientId === clientId);
  for (const grant of held) await api.revokeGrant(grant.id, userId);
  return held.length > 0;
}

/** Every connection of a deleted account, after the deletion: its tokens already fail at the validator, which finds
    no account. */
export async function forgetAccount(env: Env, origin: string, userId: string): Promise<number> {
  const api = authorizationServer(env, origin).getOAuthApi(env);
  const held = await userGrants(env, origin, userId);
  for (const grant of held) await api.revokeGrant(grant.id, userId);
  return held.length;
}

const CLIENT_ID_MAX = 200;

/** POST /api/settings/connections and POST /api/settings/connections/disconnect {clientId}: the signed-in account's
    connected apps, from the site's own pages. */
export async function connectionsRoute(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "Invalid request." }, 403);
  const session = await getSession(env, request.headers, { fresh: true });
  if (!session) return json({ error: "Sign in to continue." }, 401);
  const limited = await overLimit(env, [[`connections:${session.user.id}`, "connections"]]);
  if (limited) return limited;
  const origin = siteOrigin(env, request);
  if (path === "/api/settings/connections") {
    return json({ connections: await listConnections(env, origin, session.user.id) });
  }
  if (path === "/api/settings/connections/disconnect") {
    const clientId = (await readJson(request))?.clientId;
    if (typeof clientId !== "string" || !clientId || clientId.length > CLIENT_ID_MAX) {
      return json({ error: "Invalid request." }, 400);
    }
    return json({
      disconnected: env.OAUTH_KV ? await disconnect(env, origin, session.user.id, clientId) : false
    });
  }
  return json({ error: "Not found" }, 404);
}
