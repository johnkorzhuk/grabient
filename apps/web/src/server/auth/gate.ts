import { deletionEmailLimits, signInEmailLimits } from "../email/send.ts";
import type { Env } from "../env.ts";
import { clientAddress } from "../limits/address.ts";
import {
  json,
  NO_STORE,
  overLimit,
  parseObject,
  privateResponse,
  readBytes,
  sameOrigin
} from "./http.ts";
import { authFor, google } from "./library.ts";
import { accountRole, adminAddress, adminsOnly, reviewerAddress } from "./roles.ts";
import { getSession } from "./session.ts";

/* Everything under /api/auth passes here before the sign-in library sees it. Only the routes the site uses are open,
   and each is counted, bounded and checked first: the library stores a link's token or a code before it asks for the
   email, so whatever must refuse an email refuses here. */

const SESSION = "/api/auth/get-session";
const GOOGLE = "/api/auth/sign-in/social";
const LINK = "/api/auth/sign-in/magic-link";
const CODE = "/api/auth/email-otp/send-verification-otp";
const CODE_SIGN_IN = "/api/auth/sign-in/email-otp";
const PASSWORD_SIGN_IN = "/api/auth/sign-in/email";
const DELETE = "/api/auth/delete-user";

// The session, Google's way back, a sign-in link opened, and the library's error address, which leads to sign-in.
const READS = new Set([
  SESSION,
  "/api/auth/callback/google",
  "/api/auth/magic-link/verify",
  "/api/auth/error"
]);
// The ways in, signing out, and asking to delete an account: Settings confirms the deletion itself.
const WRITES = new Set([GOOGLE, LINK, CODE, CODE_SIGN_IN, "/api/auth/sign-out", DELETE]);

// The addresses connected apps used before /oauth. An app that kept them is answered in words it acts on, never with
// a 404 it may retry forever.
const OLD_TOKEN = "/api/auth/oauth2/token";
const OLD_AUTHORIZE = "/api/auth/oauth2/authorize";

// Nothing the site sends the library is more than a few hundred bytes.
const BODY_MAX = 2048;
const EMAIL_BUSY = "Email sign-in is busy. Try again later.";

/** The same request carrying only the fields a route may pass on. */
function withBody(request: Request, body: Record<string, unknown>): Request {
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  return new Request(request.url, { method: request.method, headers, body: JSON.stringify(body) });
}

const strings = (body: Record<string, unknown>, keys: readonly string[]) =>
  Object.fromEntries(
    keys.flatMap(key => (typeof body[key] === "string" ? [[key, body[key]]] : []))
  );

const invalidBody = () => json({ error: "Invalid request body" }, 400);

export async function handleAuth(request: Request, env: Env): Promise<Response> {
  if (!env.BETTER_AUTH_SECRET) return json({ error: "Sign-in is unavailable." }, 503);
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (method === "POST" && path === OLD_TOKEN) {
    return json(
      {
        error: "invalid_grant",
        error_description: "This connection moved. Connect the app again."
      },
      400,
      { "Access-Control-Allow-Origin": "*" }
    );
  }
  if (method === "GET" && path === OLD_AUTHORIZE) {
    return new Response(null, {
      status: 303,
      headers: { ...NO_STORE, Location: "/connect?problem=expired" }
    });
  }
  if (method !== "GET" && method !== "POST") return json({ error: "Method not allowed" }, 405);
  const open =
    method === "GET"
      ? READS.has(path)
      : WRITES.has(path) || (path === PASSWORD_SIGN_IN && Boolean(env.REVIEWER_EMAIL));
  if (!open) return json({ error: "Not found" }, 404);
  const who = clientAddress(request) ?? "local";
  if (method === "GET") {
    // Each reads a row or two by an index and writes nothing before a sign-in completes: the isolate counts them.
    const limited = await overLimit(env, [[`auth-read:${who}`, "authRead"]]);
    if (limited) return limited;
    if (path === SESSION && adminsOnly(env)) {
      // Ends any session that is not an admin's; the library's own fresh read then finds it gone and clears its cookies.
      await getSession(env, request.headers);
      const url = new URL(request.url);
      url.searchParams.set("disableCookieCache", "true");
      request = new Request(url, request);
    }
    return privateResponse(await authFor(env).handler(request));
  }

  if (!sameOrigin(request)) return json({ error: "Invalid request." }, 403);
  if (path === GOOGLE && !google(env)) {
    return json({ error: "Google sign-in isn't available here. Use email." }, 503);
  }
  const emailed = path === LINK || path === CODE;
  if (!emailed) {
    // Asking to delete an account sends an email and has the tighter allowance.
    const limited = await overLimit(env, [
      path === DELETE ? [`${DELETE}:${who}`, "emailAsk"] : [`auth:${who}`, "authPost"]
    ]);
    if (limited) return limited;
  }
  let body: Record<string, unknown> | null = null;
  if (request.body) {
    const bytes = await readBytes(request, BODY_MAX);
    if (!bytes) return json({ error: "Request body too large" }, 413);
    if (request.headers.get("Content-Type")?.startsWith("application/json"))
      body = parseObject(bytes);
    request = new Request(request, { body: bytes });
  }

  if (emailed) {
    const email = body?.email;
    if (typeof email !== "string" || (path === CODE && body?.type !== "sign-in"))
      return invalidBody();
    // A link and a code count against the same allowances, the address asking first, so probing is throttled.
    const asked = await overLimit(env, [[`${LINK}:${who}`, "emailAsk"]], EMAIL_BUSY);
    if (asked) return asked;
    // Where only admins sign in, any other address is answered as if its email went out, so the form tells nobody
    // which addresses are admins'. Nothing is stored, counted or sent for it.
    if (adminsOnly(env) && !(await adminAddress(env, email))) {
      return json(path === LINK ? { status: true } : { success: true });
    }
    const spent = await overLimit(env, signInEmailLimits(email), EMAIL_BUSY);
    if (spent) return spent;
    // The address and where to go next alone: a new account's name comes from Google or Settings, never from whoever
    // typed its address.
    request = withBody(
      request,
      path === LINK
        ? strings({ ...body, email }, ["email", "callbackURL", "errorCallbackURL"])
        : { email, type: "sign-in" }
    );
  } else if (path === CODE_SIGN_IN) {
    if (typeof body?.email !== "string" || typeof body.otp !== "string") return invalidBody();
    request = withBody(request, { email: body.email, otp: body.otp });
  } else if (path === PASSWORD_SIGN_IN) {
    if (typeof body?.email !== "string" || typeof body.password !== "string") return invalidBody();
    // Only a try for the reviewers' address hashes a password: those are counted, the rest refused by the library's
    // hook before any work.
    if (reviewerAddress(env, body.email)) {
      const limited = await overLimit(env, [
        [`password:${who}`, "passwordSignIn"],
        ["password-sign-in", "passwordSignInDaily"]
      ]);
      if (limited) return limited;
    }
    request = withBody(request, { email: body.email, password: body.password });
  } else if (path === DELETE) {
    const session = await getSession(env, request.headers, { fresh: true });
    if (!session) return json({ error: "Sign in to continue." }, 401);
    // An admin account holds the site's curation and its record: never deleted from Settings.
    if ((await accountRole(env, session.user.id)) === "admin") {
      return json({ error: "Admin accounts can't be deleted here." }, 403);
    }
    const limited = await overLimit(env, deletionEmailLimits(session.user.email));
    if (limited) return limited;
    // Only the email is asked for here: a token sent along would be spent before its owner is checked.
    request = withBody(request, {});
  }
  return privateResponse(await authFor(env).handler(request));
}
