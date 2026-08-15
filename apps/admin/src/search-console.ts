// Google Search Console — organic search performance.
//
// This is the channel that matters for grabient.com. The top content is
// /palettes/purple, /palettes/blue, /palettes/rose; people arrive by searching
// for colours, not by clicking campaigns. Cloudflare can count those arrivals
// but cannot say what was searched for, and its refererHost dimension is not
// available on this plan — so GSC is the only source of queries, impressions,
// clicks and position.
//
// Auth is the two-legged OAuth flow for service accounts: sign a JWT assertion
// with the account's RSA key, POST it to Google's token endpoint, get a bearer
// token back. No user interaction, no refresh token to keep alive. `jose` is
// already a dependency (access.ts verifies Access assertions with it), so this
// adds nothing to the bundle.

import { SignJWT, importPKCS8 } from "jose";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3/sites";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

export interface SearchRow {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsole {
  queries: SearchRow[];
  pages: SearchRow[];
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  days: number;
  property: string;
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

/**
 * Which property to query, discovered rather than configured.
 *
 * Search Console addresses a Domain property as `sc-domain:grabient.com` and a
 * URL-prefix property as `https://grabient.com/`. Guessing wrong does not error
 * in any obvious way — it authenticates fine and returns an empty result set,
 * which looks identical to "no search traffic". Rather than make a human know
 * which kind their property is, ask the API what this service account can see
 * and take the match. GSC_PROPERTY still overrides, for the case of several
 * properties covering the same host.
 */
async function discoverProperty(token: string): Promise<string | null> {
  try {
    const res = await fetch(API_BASE, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error(`GSC site list failed (${res.status})`, (await res.text()).slice(0, 200));
      return null;
    }
    const payload: any = await res.json();
    const entries: any[] = payload?.siteEntry ?? [];
    if (entries.length === 0) {
      console.error(
        "GSC returned no properties — the service account is authenticated but has not been added as a user in Search Console (Settings -> Users and permissions).",
      );
      return null;
    }
    const urls = entries
      .filter((entry) => entry.permissionLevel && entry.permissionLevel !== "siteUnverifiedUser")
      .map((entry) => String(entry.siteUrl));
    // Prefer the domain property: it covers www and bare host together, so it
    // is the superset whenever both are present.
    const domain = urls.find((url) => url.startsWith("sc-domain:") && url.includes("grabient"));
    const prefix = urls.find((url) => url.includes("grabient"));
    const chosen = domain ?? prefix ?? urls[0] ?? null;
    if (chosen) console.log(`GSC property discovered: ${chosen}`);
    return chosen;
  } catch (err) {
    console.error("GSC site list threw", err);
    return null;
  }
}

/** GSC data lags ~2 days, so the window ends before today or the tail reads as a cliff. */
const LAG_DAYS = 3;
const WINDOW_DAYS = 28;
const TTL_MS = 30 * 60 * 1000;

let cache: { at: number; value: SearchConsole } | null = null;
// Access tokens last an hour; re-minting one per dashboard load would mean an
// RSA signature and a round trip to Google on every page view.
let tokenCache: { at: number; expiresAt: number; token: string } | null = null;

function parseAccount(raw: string): ServiceAccount | null {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.client_email !== "string" || typeof parsed?.private_key !== "string") {
      console.error("GSC_SERVICE_ACCOUNT is missing client_email or private_key");
      return null;
    }
    return parsed as ServiceAccount;
  } catch {
    console.error("GSC_SERVICE_ACCOUNT is not valid JSON");
    return null;
  }
}

async function accessToken(account: ServiceAccount, now: Date): Promise<string | null> {
  if (tokenCache && now.getTime() < tokenCache.expiresAt - 60_000) return tokenCache.token;

  let assertion: string;
  try {
    // The JSON key stores the PEM with escaped newlines when it has been through
    // an env var; restore them or importPKCS8 rejects the key.
    const pem = account.private_key.replace(/\\n/g, "\n");
    const key = await importPKCS8(pem, "RS256");
    assertion = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: "RS256" })
      .setIssuer(account.client_email)
      .setAudience(TOKEN_URL)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(now.getTime() / 1000) + 3600)
      .sign(key);
  } catch (err) {
    console.error("GSC assertion signing failed", err);
    return null;
  }

  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    });
    const payload: any = await res.json();
    if (!res.ok || !payload?.access_token) {
      console.error(`GSC token exchange failed (${res.status})`, JSON.stringify(payload).slice(0, 200));
      return null;
    }
    tokenCache = {
      at: now.getTime(),
      token: payload.access_token,
      expiresAt: now.getTime() + (payload.expires_in ?? 3600) * 1000,
    };
    return tokenCache.token;
  } catch (err) {
    console.error("GSC token exchange threw", err);
    return null;
  }
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function queryDimension(
  property: string,
  token: string,
  dimension: "query" | "page",
  since: string,
  until: string,
): Promise<SearchRow[]> {
  const res = await fetch(
    `${API_BASE}/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: since,
        endDate: until,
        dimensions: [dimension],
        rowLimit: 15,
        type: "web",
      }),
    },
  );
  if (!res.ok) {
    console.error(`GSC ${dimension} query failed (${res.status})`, (await res.text()).slice(0, 200));
    return [];
  }
  const payload: any = await res.json();
  return (payload.rows ?? []).map((row: any) => ({
    key: row.keys?.[0] ?? "—",
    clicks: row.clicks ?? 0,
    impressions: row.impressions ?? 0,
    ctr: (row.ctr ?? 0) * 100,
    position: row.position ?? 0,
  }));
}

/**
 * Returns null when unconfigured or when Google refuses — same contract as
 * traffic.ts, so the dashboard drops the section rather than failing.
 *
 * The most common cause of an authenticated-but-empty response is the property
 * string: a Domain property is addressed as `sc-domain:grabient.com`, a URL
 * prefix property as `https://grabient.com/`, and the wrong one returns 403 or
 * an empty row set rather than anything that looks like a mistake. Hence
 * GSC_PROPERTY being explicit rather than guessed.
 */
export async function loadSearchConsole(env: Env, now: Date): Promise<SearchConsole | null> {
  const raw = env.GSC_SERVICE_ACCOUNT?.trim();
  if (!raw) return null;
  if (cache && now.getTime() - cache.at < TTL_MS) return cache.value;

  const account = parseAccount(raw);
  if (!account) return null;

  const token = await accessToken(account, now);
  if (!token) return null;

  // Explicit config wins; otherwise ask the API which property this account can
  // actually read, so there is one less value to get wrong.
  const property = env.GSC_PROPERTY?.trim() || (await discoverProperty(token));
  if (!property) return null;

  const until = new Date(now);
  until.setUTCDate(until.getUTCDate() - LAG_DAYS);
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - WINDOW_DAYS);

  try {
    const [queries, pages] = await Promise.all([
      queryDimension(property, token, "query", isoDay(since), isoDay(until)),
      queryDimension(property, token, "page", isoDay(since), isoDay(until)),
    ]);
    // Deliberately NOT returning null on an empty result. Null is the
    // "not configured" signal, and a property verified an hour ago legitimately
    // returns zero rows — collapsing the two would make the brief tell an agent
    // that Search Console is not connected when it is, just young. Callers
    // distinguish on `queries.length`.

    // Totals from the query rows: impressions and clicks sum cleanly, but
    // position must be weighted by impressions — a plain mean would let a
    // keyword with three impressions at position 1 outrank the whole site.
    const clicks = queries.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = queries.reduce((sum, row) => sum + row.impressions, 0);
    const weighted = queries.reduce((sum, row) => sum + row.position * row.impressions, 0);

    const value: SearchConsole = {
      queries,
      pages,
      totals: {
        clicks,
        impressions,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        position: impressions > 0 ? weighted / impressions : 0,
      },
      days: WINDOW_DAYS,
      property,
    };
    cache = { at: now.getTime(), value };
    return value;
  } catch (err) {
    console.error("GSC fetch failed", err);
    return null;
  }
}
