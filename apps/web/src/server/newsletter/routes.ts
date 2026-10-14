import { newsletter } from "@grabient/email";
import { msg } from "@grabient/i18n";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { accountRole } from "@grabient/server/auth/roles.ts";
import { getSession, type Session } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import * as v from "valibot";
import { Choice, Press, UNSUBSCRIBE_TOKEN } from "../../features/newsletter/input.ts";
import { PAGE } from "../../lib/cache.ts";
import { json as publicJson } from "../../lib/responses.ts";
import { publicOrigin } from "../seo/site.ts";
import { ISSUES } from "./issues/index.ts";
import { isSubscribed, issueFoot, readerOf, setSubscribed, tokenOwner } from "./list.ts";
import { beforeOf, draftsAmong, languageOf, publishedIssues } from "./page.ts";
import { sendIssue, unsendable } from "./send.ts";

/* The newsletter's answers. The public one is the published issues; every other is one account's and never kept
   (`json` from auth/http.ts is private, no-store). An error names its English with msg() for the page to translate. */

const CHOICE_BODY_MAX = 256;
const BAD_LINK = msg("This link isn't valid.");

const methodNotAllowed = () => json({ error: "Method not allowed" }, 405);

/* The account a request is from, or the answer that refuses it. */
async function signedIn(
  request: Request,
  env: Env,
  options: { write: boolean }
): Promise<Session | Response> {
  if (!env.BETTER_AUTH_SECRET) return json({ error: msg("Account data is unavailable.") }, 503);
  if (options.write && !sameOrigin(request)) return json({ error: msg("Invalid request.") }, 403);
  const session = await getSession(env, request.headers, { fresh: options.write });
  return session ?? json({ error: msg("Sign in to continue.") }, 401);
}
/* An admin's request, the role read from the database on every call. */
async function admin(request: Request, env: Env, options: { write: boolean }) {
  const session = await signedIn(request, env, options);
  if (session instanceof Response) return session;
  return (await accountRole(env, session.user.id)) === "admin"
    ? session
    : json({ error: "Forbidden" }, 403);
}

/** `GET /api/newsletter?before=&lang=`: published issues, two at a time, kept at the edge five minutes. */
export function issuesResponse(request: Request, env: Env): Response {
  const params = new URL(request.url).searchParams;
  const page = publishedIssues(publicOrigin(env, request), languageOf(params), beforeOf(params));
  return publicJson(page, { headers: PAGE });
}

/** `GET /api/me/newsletter/drafts?lang=`: the drafts, for an admin alone. */
export async function draftsResponse(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed();
  const session = await admin(request, env, { write: false });
  if (session instanceof Response) return session;
  const lang = languageOf(new URL(request.url).searchParams);
  return json({ issues: draftsAmong(ISSUES, publicOrigin(env, request), lang) });
}

/** `GET /api/me/newsletter`: whether the account gets the newsletter. `PUT { subscribed }` changes it from Settings. The
    isolate alone counts these, so the switch works while the limiter is down. */
export async function choiceResponse(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PUT") return methodNotAllowed();
  const write = request.method === "PUT";
  const session = await signedIn(request, env, { write });
  if (session instanceof Response) return session;
  const userId = session.user.id;
  const limited = await overLimit(env, [[`newsletter:${userId}`, "newsletterChoice"]]);
  if (limited) return limited;
  if (!write) return json({ subscribed: await isSubscribed(env, userId) });
  const body = v.safeParse(Choice, await readJson(request, CHOICE_BODY_MAX));
  if (!body.success) return json({ error: 'Send { "subscribed": true or false }.' }, 400);
  await setSubscribed(env, userId, body.output.subscribed, "settings");
  return json({ subscribed: body.output.subscribed });
}

/** `POST /unsubscribe/{token}`, the address every issue carries. It ends the newsletter for the token's account with no
    sign-in: a mail app's one-click button posts here (RFC 8058), and so does the page at the address. The answer is a
    plain 200 with no cookie and no redirect. No limit stands in front of ending it: a mail service sends many readers'
    presses from a few addresses, and a wrong token reads one indexed row and writes nothing. Only the page's own press,
    from the site's origin, subscribes again. */
export async function unsubscribeResponse(
  request: Request,
  env: Env,
  token: string | undefined
): Promise<Response> {
  if (!token || !UNSUBSCRIBE_TOKEN.test(token)) return json({ error: BAD_LINK }, 404);
  const page = sameOrigin(request);
  const press = page ? v.safeParse(Press, await readJson(request, CHOICE_BODY_MAX)) : null;
  const subscribed = press?.success === true && press.output.subscribed === true;
  if (subscribed) {
    // each press back and forth writes a row or two: a link's worth an hour
    const limited = await overLimit(env, [[`resubscribe:${token}`, "newsletterBack"]]);
    if (limited) return limited;
  }
  const userId = await tokenOwner(env, token);
  if (!userId) return json({ error: BAD_LINK }, 404);
  await setSubscribed(env, userId, subscribed, page ? "page" : "mail-app");
  return json({ subscribed });
}

/** `POST /api/me/newsletter/test`: an admin sends the issue about to go out, the newest, to their own address alone,
    with their own foot, to see in a real inbox that the sender, the unsubscribe link and the mail app's own unsubscribe
    button work. Counted per account and against the newsletter's day before Resend is asked. */
export async function testResponse(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const session = await admin(request, env, { write: true });
  if (session instanceof Response) return session;
  const problem = await unsendable(env);
  if (problem) return json({ error: problem }, 503);
  const origin = publicOrigin(env, request);
  const reader = await readerOf(env, origin, session.user.id);
  if (!reader)
    return json({ error: msg("Turn on the newsletter in Settings to send a test.") }, 409);
  const limited = await overLimit(env, [
    [`newsletter-test:${session.user.id}`, "newsletterTest"],
    ["newsletter-day", "newsletterDaily"]
  ]);
  if (limited) return limited;
  const newest = ISSUES.reduce((a, b) => (b.number > a.number ? b : a));
  const words = newest.write(origin);
  try {
    await sendIssue(
      env,
      reader,
      newsletter({ ...words, ...issueFoot(reader), origin, subject: `[Test] ${words.subject}` })
    );
  } catch (error) {
    console.error(
      "newsletter: the test issue was not sent",
      error instanceof Error ? error.message : error
    );
    return json({ error: msg("Couldn't send the test. See the Worker's log.") }, 502);
  }
  return json({ sent: true });
}
