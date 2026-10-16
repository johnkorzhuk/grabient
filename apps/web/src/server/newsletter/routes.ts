import { newsletter } from "@grabient/email";
import { DEFAULT_LOCALE, LOCALES, localizePath, msg } from "@grabient/i18n";
import { json, overLimit, readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { accountRole } from "@grabient/server/auth/roles.ts";
import { getSession, type Session } from "@grabient/server/auth/session.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff, pausedBy } from "@grabient/server/flags/flags.ts";
import * as v from "valibot";
import { Choice, Press, SheetChoice, UNSUBSCRIBE_TOKEN } from "../../features/newsletter/input.ts";
import { PAGE } from "../../lib/cache.ts";
import { json as publicJson } from "../../lib/responses.ts";
import { cacheKey } from "../cache-keys.ts";
import { forget } from "../edge-cache.ts";
import { publicOrigin } from "../seo/site.ts";
import { ISSUES } from "./issues/index.ts";
import { asRun, chooseLead, chooseTip, leadOptions, tipOptions } from "./lead.ts";
import { isSubscribed, issueFoot, readerOf, setSubscribed, tokenOwner } from "./list.ts";
import { draftsAmong, drawn, issueFacts, publishedIssues, testIssue } from "./page.ts";
import { beforeOf, languageOf } from "./query.ts";
import { sendIssue, unsendable } from "./send.ts";

/* The newsletter's answers. The public one is the published issues; every other is one account's and never kept
   (`json` from auth/http.ts is private, no-store). An error names its English with msg() for the page to translate. */

const CHOICE_BODY_MAX = 256;
const SHEET_BODY_MAX = 256;
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
export async function issuesResponse(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const page = await publishedIssues(
    env,
    publicOrigin(env, request),
    languageOf(params),
    beforeOf(params)
  );
  return publicJson(page, { headers: PAGE });
}

/** `GET /api/me/newsletter/drafts?lang=`: the drafts, for an admin alone. */
export async function draftsResponse(request: Request, env: Env): Promise<Response> {
  if (request.method !== "GET") return methodNotAllowed();
  const session = await admin(request, env, { write: false });
  if (session instanceof Response) return session;
  const lang = languageOf(new URL(request.url).searchParams);
  const facts = await issueFacts(env);
  return json({ issues: draftsAmong(ISSUES, publicOrigin(env, request), lang, facts) });
}

/* The pages that show the published issues, as this data center keeps them: /newsletter in every language and the
   newest page of its API. A choice of lead or tip lets go of them here; the others keep theirs out their five
   minutes. */
const issuePages = (origin: string) =>
  LOCALES.flatMap(locale => [
    cacheKey(new URL(origin + localizePath("/newsletter", locale)), "/newsletter", locale),
    cacheKey(
      new URL(`${origin}/api/newsletter${locale === DEFAULT_LOCALE ? "" : `?lang=${locale}`}`),
      "/api/newsletter",
      DEFAULT_LOCALE
    )
  ]);

/* The parts of an issue an admin chooses among the ones it offers: the palette it leads with, by seed, and the quick
   tip it ends with, by id. */
type Part = "lead" | "tip";
const FIELD = { lead: "seed", tip: "tip" } as const;
const ASK: Readonly<Record<Part, string>> = {
  lead: 'Send { "issue": a number, "seed": a palette }.',
  tip: 'Send { "issue": a number, "tip": a tip }.'
};

/* An admin's sheet of an issue, drawn with a lead and a tip it offers, each the one chosen unless the request names
   another, with the options of the route's part, named, and the one chosen. A GET's address names the issue, its lead
   and its tip; a POST's body names the issue and the one it chooses, which the sheet is then drawn with, and its
   address the other part's alone. */
async function sheetResponse(request: Request, env: Env, part: Part): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return methodNotAllowed();
  const write = request.method === "POST";
  const session = await admin(request, env, { write });
  if (session instanceof Response) return session;
  const url = new URL(request.url);
  const origin = publicOrigin(env, request);
  const params = url.searchParams;
  const addressed = (field: "seed" | "tip") =>
    write && field === FIELD[part] ? undefined : (params.get(field) ?? undefined);
  const asked = v.safeParse(SheetChoice, {
    seed: addressed("seed"),
    tip: addressed("tip"),
    ...(write ? await readJson(request, SHEET_BODY_MAX) : { issue: Number(params.get("issue")) })
  });
  if (!asked.success) return json({ error: ASK[part] }, 400);
  const issue = ISSUES.find(held => held.number === asked.output.issue);
  if (!issue) return json({ error: msg("Not found") }, 404);
  const content = issue.write(origin);
  const leads = leadOptions(issue, content);
  const tips = tipOptions(content);
  if (part === "tip" && !tips.length) return json({ error: msg("Not found") }, 404);
  const { seed, tip } = asked.output;
  if (seed !== undefined && !leads.some(option => option.seed === seed)) {
    return json({ error: "That palette is not one this issue offers to lead with." }, 400);
  }
  if (tip !== undefined && !tips.some(option => option.id === tip)) {
    return json({ error: "That tip is not one this issue offers." }, 400);
  }
  const asks = asked.output[FIELD[part]];
  if (write && asks !== undefined) {
    await (part === "lead" ? chooseLead : chooseTip)(env, issue.number, asks, session.user.id);
    await forget(issuePages(url.origin));
  }
  const facts = await issueFacts(env);
  const options =
    part === "lead"
      ? leads.map(option => ({ id: option.seed, name: facts.names.get(option.seed) ?? "" }))
      : tips.map(option => ({ id: option.id, name: option.name }));
  // a choice the issue no longer offers is no choice: the issue runs with its first
  const held = (part === "lead" ? facts.leads : facts.tips).get(issue.number);
  const chosen = held !== undefined && options.some(option => option.id === held) ? held : null;
  return json({
    options,
    chosen,
    shown: asks ?? chosen ?? options[0].id,
    html: drawn(issue, origin, languageOf(params), facts, seed, tip).html
  });
}

/** `GET /api/me/newsletter/lead?issue=&seed=&tip=&lang=`: an issue's sheet led by one of the palettes it offers and
    ending with one of its tips (each the one chosen unless the address names another), with every palette it offers to
    lead with, named, and the one chosen. `POST { issue, seed }` chooses the lead, for the page and every issue sent
    from then on. An admin's alone. */
export const leadResponse = (request: Request, env: Env) => sheetResponse(request, env, "lead");

/** `GET /api/me/newsletter/tip?issue=&seed=&tip=&lang=`: the same sheet, with every quick tip the issue offers, named,
    and the one chosen. `POST { issue, tip }` chooses the tip it ends with, as the lead's choice does. An admin's
    alone. */
export const tipResponse = (request: Request, env: Env) => sheetResponse(request, env, "tip");

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

/** `POST /api/me/newsletter/test`: an admin sends this month's issue (`testIssue`) to their own address alone, with
    their own foot, to see it in a real inbox and that the sender, the unsubscribe link and the mail app's own
    unsubscribe button work. Counted per account and against the newsletter's day before Resend is asked. */
export async function testResponse(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return methodNotAllowed();
  const session = await admin(request, env, { write: true });
  if (session instanceof Response) return session;
  if (await flagOff(env, "newsletter")) {
    const off = msg("The newsletter is turned off in Site features.");
    return json({ error: off }, 503, pausedBy("newsletter"));
  }
  const problem = unsendable(env);
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
  const words = asRun(testIssue(ISSUES), origin, await issueFacts(env));
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
