import type { OAuthAuthorizationServer } from "@cloudflare/workers-oauth-provider";
import { NO_STORE, readBytes } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff, pausedBy } from "@grabient/server/flags/flags.ts";
import { checkLimits, type LimitCheck } from "@grabient/server/limits/check.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { clientKind } from "./clients.ts";
import {
  clientIdAllowed,
  refreshLimits,
  registerLimits,
  requester,
  tokenLimits
} from "./limits.ts";

/* The two endpoints an app calls itself, with no cookie: registration and the token endpoint (which also revokes).
   Each is the library's, with Grabient's limits, body bound and tolerances in front. */

type Server = OAuthAuthorizationServer<Env>;

const BODY_MAX = 8 * 1024;
/** KV takes one write a second per key; a refused code exchange is sent again after this long. */
export const KV_WRITE_SPACING_MS = 1100;

/** CORS for a browser app on another origin, as the library sets on its own answers. */
export function withCors(response: Response, request: Request): Response {
  const from = request.headers.get("Origin");
  if (!from) return response;
  const out = new Response(response.body, response);
  out.headers.set("Access-Control-Allow-Origin", from);
  out.headers.set("Access-Control-Expose-Headers", "WWW-Authenticate, Retry-After");
  out.headers.append("Vary", "Origin");
  return out;
}

/** A refusal before the library, in the shape of its own errors. */
export const oauthError = (
  request: Request,
  error: string,
  description: string,
  status: number,
  headers: Record<string, string> = {}
) =>
  withCors(
    Response.json(
      { error, error_description: description },
      { status, headers: { ...NO_STORE, ...headers } }
    ),
    request
  );

/** A request past its limits (429), or whose limits cannot be counted (503), refused in the shape of the library's
    errors, with when to try again; null when it may go on. */
async function overOAuthLimit(
  request: Request,
  env: Env,
  checks: readonly LimitCheck[]
): Promise<Response | null> {
  const result = await checkLimits(env, checks);
  if (result?.success) return null;
  if (!result) {
    return oauthError(request, "temporarily_unavailable", "Try again shortly.", 503, {
      "Retry-After": "5"
    });
  }
  const wait = Math.max(1, result.reset - Math.floor(Date.now() / 1000));
  return oauthError(request, "temporarily_unavailable", "Too many requests.", 429, {
    "Retry-After": String(wait)
  });
}

/** The body as sent, at most 8 KB, or null past it. */
async function bodyText(request: Request): Promise<string | null> {
  if (!request.body) return "";
  const bytes = await readBytes(request, BODY_MAX);
  return bytes && new TextDecoder().decode(bytes);
}

/** The headers the library may read: where a browser app calls from, and its credentials. */
function forwarded(request: Request, contentType: string | null, authorization: string | null) {
  const headers = new Headers();
  for (const [name, value] of [
    ["Content-Type", contentType],
    ["Origin", request.headers.get("Origin")],
    ["Authorization", authorization]
  ] as const) {
    if (value) headers.set(name, value);
  }
  return headers;
}

/* The library refuses a registration that lists a grant it does not implement (Claude lists jwt-bearer), and gives one
   that names no method client_secret_basic, which no MCP app expects. RFC 7591 §2 lets a server replace requested
   values. */
function narrowed(body: unknown): unknown {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const out: Record<string, unknown> = { ...body };
  const keep = (key: string, allowed: readonly string[]) => {
    const list = out[key];
    if (!Array.isArray(list)) return;
    const kept = list.filter(value => typeof value === "string" && allowed.includes(value));
    if (kept.length) out[key] = kept;
  };
  keep("grant_types", ["authorization_code", "refresh_token"]);
  keep("response_types", ["code"]);
  if (
    out.token_endpoint_auth_method === undefined &&
    out.token_endpoint_auth_methods_supported === undefined
  ) {
    out.token_endpoint_auth_method = "none";
  }
  return out;
}

export async function register(
  request: Request,
  env: Env,
  server: Server,
  ctx: ExecutionContext
): Promise<Response> {
  // a preflight and another method are the library's to answer
  if (request.method !== "POST") return server.fetch(request, env, ctx);
  if (await flagOff(env, "mcp")) {
    return oauthError(request, "temporarily_unavailable", "Connecting apps is paused.", 503, {
      "Retry-After": "300",
      ...pausedBy("mcp")
    });
  }
  const limited = await overOAuthLimit(request, env, registerLimits(requester(request)));
  if (limited) return limited;
  const text = await bodyText(request);
  if (text === null)
    return oauthError(request, "invalid_request", "Send a body of at most 8 KB.", 413);
  let body = text;
  let method = "unread";
  try {
    const sent = narrowed(JSON.parse(text)) as Record<string, unknown> | null;
    body = JSON.stringify(sent);
    method = String(sent?.token_endpoint_auth_method ?? "unnamed");
  } catch {
    // a body that is not JSON is the library's to refuse
  }
  const answer = await server.fetch(
    new Request(request.url, {
      method: "POST",
      headers: forwarded(request, "application/json", request.headers.get("Authorization")),
      body
    }),
    env,
    ctx
  );
  countUsage(env, "oauth", "register", method, String(answer.status));
  return answer;
}

/** A Basic header's client id and secret, form-decoded as the library reads them, or null. */
function basicCredentials(header: string | null): { id: string; secret: string } | null {
  const match = header ? /^basic[ \t]+(\S+)$/i.exec(header.trim()) : null;
  if (!match) return null;
  try {
    const pair = atob(match[1]!);
    const at = pair.indexOf(":");
    if (at < 0) return null;
    const decode = (part: string) => decodeURIComponent(part.replaceAll("+", " "));
    return { id: decode(pair.slice(0, at)), secret: decode(pair.slice(at + 1)) };
  } catch {
    return null;
  }
}

/** Sends a token request; a code exchange that KV refused is sent once more after the write spacing. A refresh is
    never replayed: its 429 means another process of the app just refreshed, and a replay would end the token that
    process received. The exchange writes the grant first, so a refused write left the code unused. */
export async function exchange(
  send: () => Promise<Response>,
  grant: string,
  replayed: (status: number) => void,
  wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
): Promise<Response> {
  const answer = await send();
  if (answer.status !== 429 || grant !== "authorization_code") return answer;
  await wait(KV_WRITE_SPACING_MS);
  const again = await send();
  replayed(again.status);
  return again;
}

export async function token(
  request: Request,
  env: Env,
  server: Server,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== "POST") return server.fetch(request, env, ctx);
  const limited = await overOAuthLimit(request, env, tokenLimits(requester(request)));
  if (limited) return limited;
  const text = await bodyText(request);
  if (text === null)
    return oauthError(request, "invalid_request", "Send a body of at most 8 KB.", 413);

  /* The tolerances: some apps send what the library refuses, though they mean what the form says. Each is counted, so
     it can go once nothing has used it for a month. A secret that is not empty stays: confidential clients use one. */
  const tolerated = (kind: string) => countUsage(env, "oauth", "tolerance", kind);
  let contentType = request.headers.get("Content-Type");
  let authorization = request.headers.get("Authorization");
  let form: URLSearchParams | null = null;
  if (/^application\/json\b/i.test(contentType ?? "")) {
    let sent: unknown = null;
    try {
      sent = JSON.parse(text);
    } catch {
      // refused below
    }
    if (!sent || typeof sent !== "object" || Array.isArray(sent)) {
      return oauthError(request, "invalid_request", "The body is not a JSON object.", 400);
    }
    form = new URLSearchParams(
      Object.entries(sent).flatMap(([key, value]): [string, string][] =>
        typeof value === "string" ? [[key, value]] : []
      )
    );
    contentType = "application/x-www-form-urlencoded";
    tolerated("json");
  } else if (/^application\/x-www-form-urlencoded\b/i.test(contentType ?? "")) {
    form = new URLSearchParams(text);
  }
  if (form) {
    const basic = basicCredentials(authorization);
    if (basic?.id && !basic.secret) {
      if (!form.has("client_id")) form.set("client_id", basic.id);
      authorization = null;
      tolerated("basic-empty-secret");
    }
    if (form.has("client_secret") && !form.get("client_secret")) {
      form.delete("client_secret");
      tolerated("empty-secret");
    }
  }

  const clientId = basicCredentials(authorization)?.id ?? form?.get("client_id") ?? "";
  const allowed = await clientIdAllowed(env, request, clientId);
  if (allowed === "invalid") return oauthError(request, "invalid_client", "Client not found", 401);
  if (allowed === "limited") {
    return oauthError(request, "temporarily_unavailable", "Too many requests.", 429, {
      "Retry-After": "60"
    });
  }
  const body = form ? form.toString() : text;
  const grant = form?.get("grant_type") ?? "";
  const refresh = grant === "refresh_token" && refreshLimits(form?.get("refresh_token"));
  if (refresh) {
    const spent = await overOAuthLimit(request, env, refresh);
    if (spent) {
      const kind = clientId ? clientKind(clientId) : "none";
      countUsage(env, "oauth", "token", "refresh_token", String(spent.status), kind);
      return spent;
    }
  }
  const answer = await exchange(
    () =>
      server.fetch(
        new Request(request.url, {
          method: "POST",
          headers: forwarded(request, contentType, authorization),
          body
        }),
        env,
        ctx
      ),
    grant,
    status => countUsage(env, "oauth", "retry", "authorization_code", String(status))
  );
  countUsage(
    env,
    "oauth",
    "token",
    grant || (form?.has("token") ? "revoke" : "none"),
    String(answer.status),
    clientId ? clientKind(clientId) : "none"
  );
  return answer;
}
