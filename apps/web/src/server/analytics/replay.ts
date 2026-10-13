import { readBytes, sameOrigin } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";

/* The site's own way to PostHog (/e), for the session recordings of readers who turned Session replay on. PostHog
   records sessions and does nothing else here (features/analytics sends no events, flags or decide calls), so this
   passes on only what a recording needs: GETs of the recorder's script and the project's config, and POSTs of
   snapshots to /s/. It forwards no cookie, token or address (a recording is anonymous), reaches no other host, and
   refuses another project's key wherever it can read one. Off the production hosts, or with the `session-replay` flag
   off, the browser is answered and nothing goes on. */

const PROJECT = "phc_YtRERLNG3jXUoOisN6NXQS9sI5Iz0gAUkiY7nX7puTK";
const HOSTS = new Set(["grabient.com", "www.grabient.com"]);
const ASSET = new RegExp(`^/(?:static/[a-z0-9.-]{1,60}\\.js|array/${PROJECT}/config(?:\\.js)?)$`);
const SNAPSHOTS = /^\/s\/?$/;
/** a recording's batches stay under a megabyte before compression; a body past this is not one */
const BODY_MAX = 2 * 1024 * 1024;
const NO_STORE = { "Cache-Control": "no-store", "CDN-Cache-Control": "no-store" };
const empty = (status: number, headers: Record<string, string> = {}) =>
  new Response(null, { status, headers: { ...NO_STORE, ...headers } });

/** Whether the request names another project where that is free to read: in the address, or in an uncompressed body
    (JSON, or the `data=` form the library falls back to). A gzipped body passes unread: unpacking it would cost more
    than forwarding it, and PostHog refuses a body that names another project or none. */
export function otherProject(url: URL, body: Uint8Array | undefined): boolean {
  const named = ["api_key", "token"].map(key => url.searchParams.get(key));
  if (body?.length && !(body[0] === 0x1f && body[1] === 0x8b)) {
    let text = new TextDecoder().decode(body);
    if (text.startsWith("data=")) {
      const data = new URLSearchParams(text).get("data") ?? "";
      try {
        text = /^\s*[[{]/.test(data)
          ? data
          : new TextDecoder().decode(Uint8Array.from(atob(data), c => c.charCodeAt(0)));
      } catch {
        return true;
      }
    }
    for (const match of text.matchAll(/"(?:api_key|token)"\s*:\s*"([^"]*)"/g)) named.push(match[1]);
  }
  return named.some(key => key !== null && key !== PROJECT);
}

export async function replayResponse(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (!HOSTS.has(url.hostname) || (await flagOff(env, "session-replay"))) return empty(204);
  if (request.method === "OPTIONS") {
    return empty(204, {
      "Access-Control-Allow-Origin": url.origin,
      "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
  }
  if (!["GET", "HEAD", "POST"].includes(request.method)) return empty(405);
  if (request.method === "POST" && !sameOrigin(request)) return empty(403);
  const path = url.pathname.replace(/^\/e(?=\/|$)/, "") || "/";
  const asset = ASSET.test(path);
  if (!asset && !SNAPSHOTS.test(path)) return empty(404);
  /* the script and the config are read, a recording is posted: a GET of /s/ is a beacon that passed no Origin check */
  if (asset ? request.method === "POST" : request.method !== "POST") return empty(405);
  /* counted in the isolate: a recording posts every few seconds, and asking the limiter's object each time would cost
     more than the proxy */
  const allowed = await checkLimits(env, [[clientAddress(request) ?? "local", "analyticsProxy"]]);
  if (!allowed?.success) return empty(429, { "Retry-After": "60" });
  let body: Uint8Array<ArrayBuffer> | undefined;
  if (request.method === "POST" && request.body) {
    const read = await readBytes(request, BODY_MAX);
    if (!read) return empty(413);
    body = read;
  }
  if (otherProject(url, body)) return empty(403);
  const target = new URL(`https://${asset ? "us-assets.i.posthog.com" : "us.i.posthog.com"}`);
  /* the path is set, never resolved against the host, so a //host in it cannot change where this goes */
  target.pathname = path;
  target.search = url.search;
  const headers = new Headers();
  for (const name of ["content-type", "content-encoding", "user-agent", "accept"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body,
    redirect: "manual"
  });
  const out = new Headers(upstream.headers);
  out.delete("set-cookie");
  out.delete("location");
  out.set("Access-Control-Allow-Origin", url.origin);
  out.set("Cache-Control", asset && upstream.ok ? "public, max-age=86400" : "no-store");
  if (!asset) out.set("CDN-Cache-Control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers: out });
}
