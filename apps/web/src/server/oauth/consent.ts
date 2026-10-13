import {
  AuthorizationError,
  type AuthRequest,
  CimdFetchError,
  type ConsentDescription,
  type OAuthAuthorizationServer
} from "@cloudflare/workers-oauth-provider";
import { DEFAULT_LOCALE, type Locale, localizePath } from "@grabient/i18n";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { accountRole } from "@grabient/server/auth/roles.ts";
import { getSession } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import {
  authorizeRequest,
  type ConsentProblem,
  loginPath,
  PROBLEMS,
  refusalOf,
  seeOther,
  signedIn
} from "./authorize.ts";
import {
  ADMIN_SCOPES,
  type ClientKind,
  clientKind,
  givenName,
  MCP_SCOPES,
  type Place,
  redirectPlace,
  SAVED_CLIENT_IDS,
  trustedRedirect
} from "./clients.ts";
import { clientIdAllowed, requester } from "./limits.ts";
import { decodeResume, tooLong } from "./resume.ts";
import { authorizationServer } from "./server.ts";

/* The consent: the facts the page /connect shows, read on the server before it renders, and the page's answer,
   POST /oauth/consent. The library binds the handle to this browser's cookie and spends it once. */

/** What the consent page shows. */
export type ConsentPage =
  | { state: "nothing" }
  | { state: "problem"; problem: ConsentProblem }
  | {
      state: "ready";
      handle: string;
      resume: string;
      account: { id: string; email: string };
      app: ConsentApp;
      /** offered to an admin connecting one of the saved apps alone, off until the admin turns it on */
      admin: { offered: true } | null;
    };
export interface ConsentApp {
  /** a saved app's name, a fetched document's host, or a registered app's own name (null when it gave none) */
  name: string | null;
  byline:
    | { kind: "published"; host: string }
    | { kind: "says"; name: string }
    | { kind: "unverified" };
  redirect: string;
  returnsTo: Place;
  loopback: boolean;
}

/* A document is self-asserted, so an app whose document Grabient fetched is named by the host of its client_id and
   what it calls itself is said as its claim; a registered app's name is not verified at all. The library names an app
   that gave no name by its id. */
function namedApp(facts: ConsentDescription): {
  kind: ClientKind;
  name: string | null;
  host: string;
} {
  const kind = clientKind(facts.clientId);
  const given = facts.clientName === facts.clientId ? null : facts.clientName;
  return {
    kind,
    name: kind === "saved" ? facts.clientName : givenName(given),
    host: facts.clientDomain ?? facts.redirectHost
  };
}

function consentApp(facts: ConsentDescription): ConsentApp {
  const { kind, name, host } = namedApp(facts);
  return {
    name: kind === "document" ? host : name,
    byline:
      kind === "saved"
        ? { kind: "published", host }
        : kind === "document"
          ? { kind: "says", name: name ?? host }
          : { kind: "unverified" },
    redirect: facts.redirectUri,
    returnsTo: redirectPlace(facts.redirectUri),
    loopback: facts.redirectIsLoopback
  };
}

/** The consent page's facts for /connect?h=…&r=…, or a sign-in redirect when the session ended on the way.
    `request` is on the site's origin; `locale` is the page's, for the way back through sign-in. */
export async function consentPage(
  request: Request,
  env: Env,
  locale: Locale = DEFAULT_LOCALE
): Promise<ConsentPage | Response> {
  const url = new URL(request.url);
  const problem = url.searchParams.get("problem");
  if (problem !== null) {
    return PROBLEMS.has(problem)
      ? { state: "problem", problem: problem as ConsentProblem }
      : { state: "nothing" };
  }
  const handle = url.searchParams.get("h");
  const resume = url.searchParams.get("r");
  if (!handle || !resume) return { state: "nothing" };
  if (!env.OAUTH_KV || (await flagOff(env, "mcp"))) return { state: "problem", problem: "paused" };
  const query = decodeResume(resume);
  if (query === null || tooLong(query)) return { state: "problem", problem: "invalid" };
  const session = await signedIn(env, request);
  if (!session) return seeOther(url.origin + localizePath(loginPath(resume), locale), 302);
  // an unsaved document is fetched again to show it: counted as the authorization page counts it
  const allowed = await clientIdAllowed(
    env,
    request,
    new URLSearchParams(query).get("client_id") ?? ""
  );
  if (allowed !== "ok")
    return { state: "problem", problem: allowed === "invalid" ? "invalid" : "unverified" };
  const oauth = authorizationServer(env, url.origin).getOAuthApi(env);
  let facts: ConsentDescription;
  try {
    facts = await oauth.describeConsent(
      await oauth.parseAuthRequest(authorizeRequest(url.origin, query))
    );
  } catch (error) {
    if (error instanceof CimdFetchError) return { state: "problem", problem: "unverified" };
    if (error instanceof AuthorizationError) return { state: "problem", problem: refusalOf(error) };
    throw error;
  }
  const admin =
    SAVED_CLIENT_IDS.has(facts.clientId) && (await accountRole(env, session.user.id)) === "admin";
  return {
    state: "ready",
    handle,
    resume,
    account: { id: session.user.id, email: session.user.email },
    app: consentApp(facts),
    admin: admin ? { offered: true } : null
  };
}

const sameRequest = (a: AuthRequest, b: AuthRequest) =>
  a.clientId === b.clientId &&
  a.redirectUri === b.redirectUri &&
  a.resource === b.resource &&
  a.codeChallenge === b.codeChallenge;

const CONSENT_MAX = 2048;

/** POST /oauth/consent, from the consent page alone: Allow or Cancel for the request its handle names, by the account
    the page showed. */
export async function consentAnswer(
  request: Request,
  env: Env,
  server: OAuthAuthorizationServer<Env>
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
  if (!sameOrigin(request)) return json({ error: "Invalid request." }, 403);
  const limited = await overLimit(env, [[`auth:${requester(request)}`, "authPost"]]);
  if (limited) return limited;
  if (!env.BETTER_AUTH_SECRET) return json({ error: "Sign-in is unavailable." }, 503);
  const body = await readJson(request, CONSENT_MAX);
  if (
    typeof body?.handle !== "string" ||
    typeof body.resume !== "string" ||
    typeof body.account !== "string" ||
    typeof body.accept !== "boolean"
  ) {
    return json({ error: "invalid" }, 400);
  }
  const session = await getSession(env, request.headers, { fresh: true });
  if (!session) return json({ error: "signin" }, 401);
  if (body.account !== session.user.id) return json({ error: "account" }, 409);
  const oauth = server.getOAuthApi(env);
  const origin = new URL(request.url).origin;
  const answered = (outcome: string) => countUsage(env, "oauth", "consent", outcome);
  const expired = () => {
    answered("expired");
    return json({ error: "expired" }, 400);
  };

  if (!body.accept) {
    let denied: Awaited<ReturnType<typeof oauth.denyConsent>>;
    try {
      denied = await oauth.denyConsent(request, body.handle);
    } catch (error) {
      if (error instanceof AuthorizationError) return expired();
      throw error;
    }
    const headers = new Headers(denied.headers);
    headers.delete("Location");
    /* to an address only its app receives at, at once; to any other, the person decides */
    if (trustedRedirect(denied.request.redirectUri)) {
      answered("denied");
      return json({ redirect: true, url: denied.redirectTo }, 200, headers);
    }
    answered("denied-untrusted");
    return json(
      { redirect: false, url: denied.redirectTo, host: new URL(denied.request.redirectUri).host },
      200,
      headers
    );
  }

  let approved: Awaited<ReturnType<typeof oauth.approveConsent>>;
  try {
    approved = await oauth.approveConsent(request, body.handle);
  } catch (error) {
    if (error instanceof AuthorizationError) return expired();
    throw error;
  }
  /* the page showed what `resume` asks: it must be the request the handle holds. The client is compared first, so a
     changed `resume` never makes the Worker fetch a document the authorization page did not check */
  const query = decodeResume(body.resume);
  if (
    query === null ||
    tooLong(query) ||
    new URLSearchParams(query).get("client_id") !== approved.request.clientId
  ) {
    return expired();
  }
  const shown = await oauth.parseAuthRequest(authorizeRequest(origin, query)).catch(() => null);
  if (!shown || !sameRequest(shown, approved.request)) return expired();
  let facts: ConsentDescription;
  try {
    facts = await oauth.describeConsent(approved.request);
  } catch (error) {
    if (!(error instanceof CimdFetchError)) throw error;
    answered("unverified");
    return json({ error: "unverified" }, 400);
  }
  const { kind, name, host } = namedApp(facts);
  /* the admin tools only when an admin chose them, on one of the saved apps: a fetched document may call itself
     anything */
  const admin =
    body.admin === true &&
    kind === "saved" &&
    (await accountRole(env, session.user.id)) === "admin";
  const { redirectTo } = await oauth.completeAuthorization({
    request: approved.request,
    userId: session.user.id,
    scope: [...(admin ? ADMIN_SCOPES : MCP_SCOPES), "offline_access"],
    metadata: { name, host, kind },
    props: { userId: session.user.id, app: name, host, kind },
    /* a document's client_id and redirect are the same on every machine and for every account of the app, so revoking
       the grants that share them would sign another installation out; a registered client_id is one installation's */
    revokeExistingGrants: kind === "registered"
  });
  answered("allowed");
  return json({ redirect: true, url: redirectTo }, 200, approved.headers);
}
