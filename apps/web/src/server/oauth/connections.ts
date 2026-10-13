import type { GrantSummary } from "@cloudflare/workers-oauth-provider";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { type ClientKind, clientKind, givenName, type Place, redirectPlace } from "./clients.ts";
import { authorizationServer, siteOrigin, YEAR } from "./server.ts";

/* The apps an account allowed, as Settings and the MCP page list them, and the ways they end: Disconnect, the account's
   deletion, and a consent past the most grants an account keeps. Every grant listed is a KV read, so a list reads at
   most GRANTS_LISTED, an account keeps at most GRANTS_KEPT, and each list is answered again from this isolate for half
   a minute. */

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

const GRANTS_LISTED = 100;
/** The most grants an account keeps: an app's document client_id is the same on every machine, so a new consent never
    ends the grants it holds elsewhere, and only this bounds them. */
export const GRANTS_KEPT = 100;
const SESSION_DAYS = 30;
const LIST_KEPT_MS = 30_000;
const LISTS_KEPT = 256;

/* Each account's list as this isolate last read it: Settings reads it again at every look back at its tab. */
const lists = new Map<string, { at: number; connections: Connection[] }>();

function heldList(userId: string): Connection[] | null {
  const held = lists.get(userId);
  if (held && Date.now() - held.at < LIST_KEPT_MS) return held.connections;
  lists.delete(userId);
  return null;
}

function holdList(userId: string, connections: Connection[]) {
  if (lists.size >= LISTS_KEPT) lists.delete(lists.keys().next().value!);
  lists.set(userId, { at: Date.now(), connections });
}

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
  lists.delete(userId);
  return held.length > 0;
}

/** Makes room for the grant a consent is about to add: an account holding GRANTS_KEPT or more loses those its apps used
    least lately, each with its tokens. A grant's key expires a year after its last use (a refresh moves it ahead), so
    the listing of its keys orders them and no grant is read. How many were ended. */
export async function makeRoomForGrant(env: Env, origin: string, userId: string): Promise<number> {
  lists.delete(userId);
  if (!env.OAUTH_KV) return 0;
  const prefix = `grant:${userId}:`;
  const held: { id: string; until: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await env.OAUTH_KV.list({ prefix, cursor });
    for (const key of page.keys) {
      const id = key.name.slice(prefix.length);
      // a key without an end cannot be dated, and is kept
      if (!id.includes(":")) held.push({ id, until: key.expiration ?? Number.POSITIVE_INFINITY });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  const over = held.length - (GRANTS_KEPT - 1);
  if (over <= 0) return 0;
  const api = authorizationServer(env, origin).getOAuthApi(env);
  const stale = held.sort((a, b) => a.until - b.until).slice(0, over);
  for (const grant of stale) await api.revokeGrant(grant.id, userId);
  return stale.length;
}

/** Every connection of a deleted account, after the deletion: its tokens already fail at the validator, which finds
    no account. */
export async function forgetAccount(env: Env, origin: string, userId: string): Promise<number> {
  const api = authorizationServer(env, origin).getOAuthApi(env);
  const held = await userGrants(env, origin, userId);
  for (const grant of held) await api.revokeGrant(grant.id, userId);
  lists.delete(userId);
  return held.length;
}

const CLIENT_ID_MAX = 200;

/** POST /api/settings/connections and POST /api/settings/connections/disconnect {clientId}: the signed-in account's
    connected apps, from the site's own pages. Every request counts against the account's minute in this isolate, and
    each that reads KV against its day. */
export async function connectionsRoute(request: Request, env: Env): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "Invalid request." }, 403);
  const session = await getSession(env, request.headers, { fresh: true });
  if (!session) return json({ error: "Sign in to continue." }, 401);
  const userId = session.user.id;
  const who = `connections:${userId}`;
  const limited = await overLimit(env, [[who, "connections"]]);
  if (limited) return limited;
  const origin = siteOrigin(env, request);
  if (path === "/api/settings/connections") {
    const held = heldList(userId);
    if (held) return json({ connections: held });
    const spent = await overLimit(env, [[who, "connectionsDaily"]]);
    if (spent) return spent;
    const connections = await listConnections(env, origin, userId);
    holdList(userId, connections);
    return json({ connections });
  }
  if (path === "/api/settings/connections/disconnect") {
    const clientId = (await readJson(request))?.clientId;
    if (typeof clientId !== "string" || !clientId || clientId.length > CLIENT_ID_MAX) {
      return json({ error: "Invalid request." }, 400);
    }
    const spent = await overLimit(env, [[who, "connectionsDaily"]]);
    if (spent) return spent;
    return json({
      disconnected: env.OAUTH_KV ? await disconnect(env, origin, userId, clientId) : false
    });
  }
  return json({ error: "Not found" }, 404);
}
