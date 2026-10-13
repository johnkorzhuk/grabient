import {
  AuthorizationError,
  type AuthRequest,
  CimdFetchError,
  type OAuthAuthorizationServer
} from "@cloudflare/workers-oauth-provider";
import {
  cookieLocale,
  DEFAULT_LOCALE,
  type Locale,
  localizePath,
  negotiateLocale,
  splitLocale
} from "@grabient/i18n";
import { json, NO_STORE, overLimit } from "../auth/http.ts";
import { getSession } from "../auth/session.ts";
import type { Env } from "../env.ts";
import { flagOff } from "../flags/flags.ts";
import { countUsage } from "../usage/count.ts";
import { trustedRedirect } from "./clients.ts";
import { clientIdAllowed, requester } from "./limits.ts";
import { decodeResume, encodeResume, RESUME_MAX, tooLong } from "./resume.ts";
import { OAUTH_PATHS } from "./server.ts";

/* GET /oauth/authorize. The request is checked before the account signs in, and an error goes back to the app only
   after it has, and only to a trusted redirect: anyone can register an https redirect, and a redirect before sign-in
   is one of the attacks OAuth 2.1 names. The consent always shows: `prompt` is never read. */

/** Why the consent page has nothing to ask: each has its own line there. */
export type ConsentProblem = "invalid" | "unverified" | "unknown" | "expired" | "paused";
export const PROBLEMS: ReadonlySet<string> = new Set<ConsentProblem>([
  "invalid",
  "unverified",
  "unknown",
  "expired",
  "paused"
]);

/** An error the library reports without a redirect: the client or its redirect is not one it knows. */
export const refusalOf = (error: AuthorizationError): ConsentProblem =>
  error.description === "Invalid client_id" ? "unknown" : "invalid";

/** The request as the library parses it, rebuilt on the site's origin so a host is never taken from `r`. */
export const authorizeRequest = (origin: string, query: string) =>
  new Request(`${origin}${OAUTH_PATHS.authorize}?${query}`);

export const loginPath = (resume: string) =>
  `/login?redirect=${encodeURIComponent(`${OAUTH_PATHS.authorize}?r=${resume}`)}`;

export const seeOther = (location: string, status = 303) =>
  new Response(null, { status, headers: { ...NO_STORE, Location: location } });

/** The account signed in on a request, read from the database: a sign-out elsewhere counts at once. */
export function signedIn(env: Env, request: Request) {
  if (!env.BETTER_AUTH_SECRET || !request.headers.has("Cookie")) return Promise.resolve(null);
  return getSession(env, request.headers, { fresh: true });
}

/** The language the pages this address leads to are in: the site's own page the reader came from (a code typed on
    /ja/login), else the language they chose, else their browser's. Another site's page names none of ours. */
export function readerLocale(request: Request, origin: string): Locale {
  const referer = request.headers.get("Referer");
  if (referer) {
    try {
      const from = new URL(referer);
      if (from.origin === origin) return splitLocale(from.pathname).locale;
    } catch {
      // no page to read
    }
  }
  return (
    cookieLocale(request.headers.get("Cookie")) ??
    negotiateLocale(request.headers.get("Accept-Language")) ??
    DEFAULT_LOCALE
  );
}

export async function authorize(
  request: Request,
  env: Env,
  server: OAuthAuthorizationServer<Env>
): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405, { Allow: "GET" });
  const limited = await overLimit(env, [[`auth-read:${requester(request)}`, "authRead"]]);
  if (limited) return limited;
  const url = new URL(request.url);
  const origin = url.origin;
  const counted = (step: string) => countUsage(env, "oauth", "authorize", step);
  /* this address is no page and has no language, so the pages it leads to are named in the reader's */
  const locale = readerLocale(request, origin);
  const here = (path: string) => origin + localizePath(path, locale);
  const problem = (key: ConsentProblem, why: string = key) => {
    counted(`problem:${why}`);
    return seeOther(here(`/connect?problem=${key}`));
  };
  if (await flagOff(env, "mcp")) return problem("paused");

  // the request as the app sent it, or as it comes back from sign-in in `r`
  const r = url.searchParams.get("r");
  let query = url.search.slice(1);
  if (r !== null && !url.searchParams.has("client_id")) {
    const decoded = decodeResume(r);
    if (decoded === null)
      return problem("invalid", r.length > RESUME_MAX ? "too-long" : "undecodable");
    query = decoded;
  }
  if (tooLong(query)) return problem("invalid", "too-long");
  const allowed = await clientIdAllowed(
    env,
    request,
    new URLSearchParams(query).get("client_id") ?? ""
  );
  if (allowed === "invalid") return problem("invalid", "client-id");
  if (allowed === "limited") return problem("unverified", "cimd-limit");

  const oauth = server.getOAuthApi(env);
  const resume = encodeResume(query);
  const toSignIn = () => {
    counted("signin");
    return seeOther(here(loginPath(resume)), 302);
  };
  let parsed: AuthRequest;
  try {
    parsed = await oauth.parseAuthRequest(authorizeRequest(origin, query));
  } catch (error) {
    // the library has logged which document and why
    if (error instanceof CimdFetchError) return problem("unverified");
    if (!(error instanceof AuthorizationError)) throw error;
    if (!error.redirectTo) return problem(refusalOf(error));
    if (!(await signedIn(env, request))) return toSignIn();
    if (!error.redirectUri || !trustedRedirect(error.redirectUri))
      return problem("invalid", "untrusted-error");
    counted("client-error");
    return seeOther(error.redirectTo, 302);
  }
  if (!(await signedIn(env, request))) return toSignIn();
  const consent = await oauth.beginConsent(parsed);
  counted("consent");
  const headers = new Headers(consent.headers);
  headers.set("Location", here(`/connect?h=${encodeURIComponent(consent.handle)}&r=${resume}`));
  return new Response(null, { status: 303, headers });
}
