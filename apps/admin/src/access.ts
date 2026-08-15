// Cloudflare Access verification.
//
// Requests to admin.grabient.com pass through a Zero Trust Access policy before
// they ever reach this worker, so in the normal case an unauthenticated visitor
// is stopped at the edge and none of this code runs. That edge check is bound to
// the hostname though, so this module re-verifies the signed assertion inside
// the worker: it is what makes the worker safe even if it is somehow reached by
// another route, and it is what turns "Cloudflare says this is fine" into a
// specific email address we can allow-list.
//
// Everything here fails CLOSED. A missing team domain, a missing audience tag, a
// malformed token and an unknown signer all deny.
import { createRemoteJWKSet, jwtVerify } from "jose";

export type AccessResult =
  | { ok: true; email: string }
  | { ok: false; status: 403 | 503; reason: string };

// createRemoteJWKSet caches the fetched signing keys and refreshes them on
// rotation, so it must outlive the request. Rebuilding it per request would
// refetch Cloudflare's certs on every page load.
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedTeam: string | undefined;

function jwksFor(teamDomain: string) {
  if (!cachedJwks || cachedTeam !== teamDomain) {
    cachedJwks = createRemoteJWKSet(
      new URL(`https://${teamDomain}/cdn-cgi/access/certs`),
    );
    cachedTeam = teamDomain;
  }
  return cachedJwks;
}

function readToken(req: Request): string | null {
  // Access sets this header on every request it forwards.
  const header = req.headers.get("Cf-Access-Jwt-Assertion");
  if (header) return header;
  // Browsers that navigated directly also carry the cookie form.
  const cookie = req.headers.get("Cookie") ?? "";
  const match = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookie);
  return match ? decodeURIComponent(match[1]!) : null;
}

export async function verifyAccess(req: Request, env: Env): Promise<AccessResult> {
  // Dev-only bypass. .dev.vars is gitignored and is NOT uploaded by
  // `wrangler deploy`, so this cannot be true in production unless someone
  // moves it into wrangler.jsonc — which the comment there forbids.
  if (env.DEV_UNSAFE_SKIP_ACCESS === "i-am-running-wrangler-dev") {
    return { ok: true, email: "dev@localhost" };
  }

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !audience) {
    // Unconfigured means unprotected, so refuse to serve anything at all
    // rather than exposing production numbers.
    return {
      ok: false,
      status: 503,
      reason: "CF_ACCESS_TEAM_DOMAIN / CF_ACCESS_AUD are not set",
    };
  }

  const token = readToken(req);
  if (!token) return { ok: false, status: 403, reason: "no Access assertion" };

  let email: string;
  try {
    const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience,
    });
    // Identity-based logins carry `email`; service tokens carry `common_name`
    // instead and are deliberately not accepted here.
    if (typeof payload.email !== "string" || !payload.email) {
      return { ok: false, status: 403, reason: "assertion has no email claim" };
    }
    email = payload.email.toLowerCase();
  } catch (err) {
    console.error("Access token verification failed", err);
    return { ok: false, status: 403, reason: "invalid Access assertion" };
  }

  // Second gate. The Access policy already decided who may reach the worker;
  // this makes widening that policy insufficient on its own to grant access to
  // production data.
  const allowed = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) {
    return { ok: false, status: 503, reason: "ADMIN_EMAILS is empty" };
  }
  if (!allowed.includes(email)) {
    return { ok: false, status: 403, reason: `${email} is not an admin` };
  }

  return { ok: true, email };
}
