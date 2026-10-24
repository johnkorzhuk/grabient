import { type Letter, newsletter } from "@grabient/email";
import {
  DEFAULT_LOCALE,
  isLocale,
  isPagePath,
  type Locale,
  localizePath,
  msg
} from "@grabient/i18n";
import { all, batch, first, run } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOffNow } from "@grabient/server/flags/flags.ts";
import {
  type LeftOut,
  type PauseReason,
  type Problem,
  SEGMENTS,
  type Segment,
  type SendState,
  type SendsAnswer,
  type SendView,
  UNSUBSCRIBE_TOKEN
} from "../../features/newsletter/input.ts";
import { PRODUCTION_ORIGIN } from "../../lib/page-meta.ts";
import { readyLocales } from "../languages.ts";
import { ISSUES } from "./issues/index.ts";
import { asRun, type IssueFacts, readFacts } from "./lead.ts";
import { issueFoot, type Reader, readerOf } from "./list.ts";
import { NotReachable, ResendRefusal, reachesReaders, sendIssue, unsendable } from "./send.ts";

/* Sending an issue to readers: three steps an admin takes, and a job that sends.

   Prepare draws the issue once in each language its readers read, checks it, and writes one outbox row per reader. It
   sends nothing. Arm takes the count prepare found, typed back, and a start at least fifteen minutes ahead, which
   leaves time to cancel. From the start, the minute job sends at most fifty a minute while the newsletter is on, until
   the outbox is empty or the send is paused.

   No reader gets an issue twice. The outbox's key is the issue and the account, a send leaves out every account and
   address an earlier send of the issue holds, and each email carries Resend's idempotency key, made of the send and the
   account, so trying an email again within the day sends nothing new. A row counts a try only once its email is handed
   to Resend; one Resend may have taken a day ago or more is marked unknown and never tried again by itself. */

/** How soon after arming a send may start: time to cancel a send armed by mistake. */
export const LEAD_MS = 15 * 60_000;
/** How far ahead a send may start: a start past a week is a date typed wrong. */
export const AHEAD_MS = 7 * 86_400_000;
/** How long past its start a send that has not begun may still begin: one armed while the newsletter was off waits for
    an admin rather than starting whenever the newsletter comes on. */
export const LATE_MS = 3_600_000;
/** The most emails one run sends; a run starts every minute. */
export const PER_RUN = 50;
/** A run takes no new email after this long, so it ends well before its lease. */
const RUN_MS = 40_000;
/** How long a run holds its send; a run that dies lets go of it after this. */
const LEASE_MS = 120_000;
/** A row a run took and never settled, as a run that died leaves it. */
const STALE_MS = 5 * 60_000;
/** Resend keeps an idempotency key a day; a row handed to Resend is tried again only well inside it. */
const RETRY_MS = 20 * 3_600_000;
const ATTEMPTS = 3;
/** How many errors in a row pause a send. */
const STREAK = 3;
/** The emails all sends together may send in a day: a ceiling far above today's list. */
export const DAILY = 5_000;
/** Failed and unknown emails past this share of those tried pause a send. */
const FAILING = 0.02;
/** The token's place in a prepared letter: no account's token, and nothing else an email says. */
export const TOKEN_SLOT = "0".repeat(64);
/** Gmail cuts an email off past 102 KB. */
const CLIPPED_BYTES = 100_000;
const CHECK_TIMEOUT_MS = 8_000;
const CHECKS_AT_ONCE = 6;
const SHOWN = 5;
const ACTIVE = "('prepared', 'armed', 'sending', 'paused')";

/* Who an issue reaches, over `auth_user u LEFT JOIN k_newsletter n`. Subscribed reads a choice as list.ts does. ?1 is
   the issue. */
const SUBSCRIBED = "COALESCE(n.subscribed, NOT u.newsletter_opt_in, 1) = 1";
const PERSONA = "u.id IN (SELECT user_id FROM k_personas)";
// the domains kept for tests and examples, which no mail server takes
const UNDELIVERABLE = `(u.email NOT LIKE '%_@_%._%' OR ${[".invalid", ".test", ".example", ".localhost", "@example.com", "@example.net", "@example.org"].map(end => `LOWER(u.email) LIKE '%${end}'`).join(" OR ")})`;
const ALREADY = `(u.id IN (SELECT user_id FROM k_newsletter_outbox WHERE issue = ?1)
  OR LOWER(u.email) IN (SELECT LOWER(a.email) FROM k_newsletter_outbox o JOIN auth_user a ON a.id = o.user_id
    WHERE o.issue = ?1))`;
const GROUPS: Readonly<Record<Segment, string>> = {
  admins: "u.role = 'admin'",
  likers: "u.id IN (SELECT user_id FROM k_likes)",
  everyone: "1"
};
// beyond production, an admin's own address and Resend's test addresses alone
const STAGED = "(u.role = 'admin' OR LOWER(u.email) LIKE '%@resend.dev')";
const LIST = "auth_user u LEFT JOIN k_newsletter n ON n.user_id = u.id";
const scope = (env: Env, segment: Segment) =>
  reachesReaders(env) ? GROUPS[segment] : `${GROUPS[segment]} AND ${STAGED}`;
const READERS = `${SUBSCRIBED} AND NOT ${PERSONA} AND NOT ${UNDELIVERABLE} AND NOT ${ALREADY}`;

/** What went wrong, as an admin is told it, with the answer's status; null when the step was taken. */
export type Refusal = { error: string; status: number; problems?: Problem[] } | null;

interface SendRow {
  id: string;
  issue: number;
  origin: string;
  segment: Segment;
  state: SendState;
  recipients: number;
  left_out: string;
  checks: string;
  starts_at: number | null;
  reason: PauseReason | null;
  created_at: number;
  armed_at: number | null;
  finished_at: number | null;
}
interface Stored extends Letter {
  locale: Locale;
}

const sendOf = (env: Pick<Env, "DB">, id: string) =>
  first<SendRow>(env.DB, "SELECT * FROM k_newsletter_sends WHERE id = ?", id);

const published = () => ISSUES.filter(issue => issue.published);

/** The campaign an issue's email carries on its links, as the visit counts and Google Analytics read it
    (server/visits): source newsletter, medium email, campaign issue-<number>. */
export const campaignTags = (issue: number) =>
  `utm_source=newsletter&utm_medium=email&utm_campaign=issue-${issue}`;

/** A letter whose links to the site's pages carry its issue's campaign, so a reader the email brings counts as the
    newsletter's: a click from a mail app says nothing of where it came from, and would show no person at all. The way
    out, the pictures and every address that is no page keep none, so the MCP's address is copied as it stands. A
    redirect passes the tags on (pipeline.ts). */
export function tagLinks(letter: Letter, origin: string, issue: number): Letter {
  const tags = campaignTags(issue);
  const tag = (url: string) => {
    const rest =
      url === origin ? "/" : url.startsWith(`${origin}/`) ? url.slice(origin.length) : null;
    if (rest === null || url.includes(TOKEN_SLOT) || !isPagePath(rest)) return url;
    const cut = url.indexOf("#");
    const [base, fragment] = cut < 0 ? [url, ""] : [url.slice(0, cut), url.slice(cut)];
    return `${base}${base.includes("?") ? "&" : "?"}${tags}${fragment}`;
  };
  // the markup writes each & of an address as &#38;, whose # is no fragment: read plain, tag, written back the same way
  const html = letter.html.replace(/href="([^"]+)"/g, (whole, held: string) => {
    const url = held.replaceAll("&#38;", "&").replaceAll("&amp;", "&");
    const tagged = tag(url);
    return tagged === url ? whole : `href="${tagged.replaceAll("&", "&#38;")}"`;
  });
  const site = new RegExp(
    `${origin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[/?#][^\\s<>")]*)?`,
    "g"
  );
  return { ...letter, html, text: letter.text.replace(site, tag) };
}

/* An issue's email in one language, with the token's place where the reader's unsubscribe token goes, and its links
   tagged with its campaign. */
function letterIn(issueNumber: number, origin: string, facts: IssueFacts, locale: Locale) {
  const issue = ISSUES.find(held => held.number === issueNumber);
  if (!issue) throw new Error(`No issue ${issueNumber}`);
  const unsubscribe = origin + localizePath(`/unsubscribe/${TOKEN_SLOT}`, locale);
  return tagLinks(
    newsletter({
      ...asRun(issue, origin, facts),
      ...issueFoot({ locale, unsubscribe }),
      origin
    }),
    origin,
    issueNumber
  );
}

/* Every address a letter's markup names: its links, its pictures and its stylesheet's files. */
const ADDRESSES = /\b(?:href|src)="([^"]+)"|url\((['"]?)([^'")]+)\2\)/g;
export function addressesOf(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(ADDRESSES)) {
    found.add((match[1] ?? match[3] ?? "").replaceAll("&amp;", "&").replaceAll("&#38;", "&"));
  }
  return [...found];
}

/* An address loads when it answers 200, after any redirect; 0 is no answer at all. */
async function statusOf(address: string): Promise<number> {
  try {
    const response = await fetch(address, {
      headers: { Accept: "text/html,image/*;q=0.9,*/*;q=0.8" },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return 0;
  }
}

/** What stops a send's letters going out: an address off the site or one that does not load, an email Gmail would cut
    short, or one without the reader's way out. Each letter's own size, and how many addresses were checked. */
export async function checkLetters(
  letters: readonly Stored[],
  origin: string
): Promise<{ problems: Problem[]; links: number; bytes: number }> {
  const problems: Problem[] = [];
  let bytes = 0;
  const addresses = new Set<string>();
  for (const letter of letters) {
    const size = new TextEncoder().encode(letter.html).length;
    bytes = Math.max(bytes, size);
    if (size > CLIPPED_BYTES) problems.push({ kind: "size", bytes: size });
    if (!letter.html.includes(TOKEN_SLOT) || !letter.text.includes(TOKEN_SLOT)) {
      problems.push({ kind: "unsubscribe" });
    }
    for (const address of addressesOf(letter.html)) {
      if (!address.includes(TOKEN_SLOT) && !address.startsWith("mailto:")) addresses.add(address);
    }
  }
  const onSite = [...addresses].filter(address => {
    const ours = address === origin || address.startsWith(`${origin}/`);
    if (!ours) problems.push({ kind: "outside", url: address });
    return ours;
  });
  for (let at = 0; at < onSite.length; at += CHECKS_AT_ONCE) {
    const part = onSite.slice(at, at + CHECKS_AT_ONCE);
    const statuses = await Promise.all(part.map(statusOf));
    part.forEach((url, i) => {
      if (statuses[i] !== 200) problems.push({ kind: "link", url, status: statuses[i] ?? 0 });
    });
  }
  return { problems, links: onSite.length, bytes };
}

/** Prepares a send of an issue to a group: who it reaches and who it leaves out, its letters drawn and checked, and an
    outbox row for each reader. Nothing is sent, and nothing is written when a check fails. */
export async function prepare(
  env: Env,
  origin: string,
  adminId: string,
  issueNumber: number,
  segment: Segment
): Promise<Refusal | { id: string }> {
  if (!SEGMENTS.includes(segment)) return { error: "Unknown group.", status: 400 };
  if (!published().some(issue => issue.number === issueNumber)) {
    return { error: msg("Only a published issue can be sent."), status: 400 };
  }
  const busy = await first(env.DB, `SELECT id FROM k_newsletter_sends WHERE state IN ${ACTIVE}`);
  if (busy)
    return { error: msg("Another send is under way. Finish or cancel it first."), status: 409 };
  const where = scope(env, segment);
  const leftOut = await first<LeftOut>(
    env.DB,
    `SELECT COALESCE(SUM(NOT (${SUBSCRIBED})), 0) AS unsubscribed,
       COALESCE(SUM((${SUBSCRIBED}) AND ${PERSONA}), 0) AS personas,
       COALESCE(SUM((${SUBSCRIBED}) AND NOT ${PERSONA} AND ${UNDELIVERABLE}), 0) AS undeliverable,
       COALESCE(SUM((${SUBSCRIBED}) AND NOT ${PERSONA} AND NOT ${UNDELIVERABLE} AND ${ALREADY}), 0) AS already
     FROM ${LIST} WHERE ${where}`,
    issueNumber
  );
  const read = await all<{ locale: string | null }>(
    env.DB,
    `SELECT DISTINCT u.locale FROM ${LIST} WHERE ${where} AND ${READERS}`,
    issueNumber
  );
  const locales = [
    ...new Set([
      DEFAULT_LOCALE,
      ...read.map(row => (isLocale(row.locale) ? row.locale : DEFAULT_LOCALE))
    ])
  ];
  // the admin's choices of lead and tip, read or refused: never drawn without them; each language ready to write in
  const [facts] = await Promise.all([readFacts(env, ISSUES), readyLocales(env, locales)]);
  const letters: Stored[] = locales.map(locale => ({
    locale,
    ...letterIn(issueNumber, origin, facts, locale)
  }));
  const checks = await checkLetters(letters, origin);
  if (checks.problems.length) {
    return {
      error: "The issue did not pass its checks.",
      status: 422,
      problems: checks.problems
    };
  }
  const id = crypto.randomUUID();
  const now = Date.now();
  const ours = `EXISTS (SELECT 1 FROM k_newsletter_sends WHERE id = ? AND state = 'prepared')`;
  await batch(env.DB, [
    [
      `INSERT INTO k_newsletter_sends (id, issue, origin, segment, state, left_out, checks, created_by, created_at,
         updated_at)
       SELECT ?, ?, ?, ?, 'prepared', ?, ?, ?, ?, ? WHERE NOT EXISTS
         (SELECT 1 FROM k_newsletter_sends WHERE state IN ${ACTIVE})`,
      id,
      issueNumber,
      origin,
      segment,
      JSON.stringify(leftOut),
      JSON.stringify({ links: checks.links, bytes: checks.bytes, locales }),
      adminId,
      now,
      now
    ],
    ...letters.map(
      letter =>
        [
          `INSERT INTO k_newsletter_letters (send_id, locale, subject, html, text) SELECT ?, ?, ?, ?, ? WHERE ${ours}`,
          id,
          letter.locale,
          letter.subject,
          letter.html,
          letter.text,
          id
        ] as const
    ),
    [
      `INSERT INTO k_newsletter_outbox (issue, user_id, send_id)
       SELECT ?1, MIN(u.id), ?2 FROM ${LIST} WHERE ${where} AND ${READERS} AND ${ours.replace("?", "?2")}
       GROUP BY LOWER(u.email)`,
      issueNumber,
      id
    ],
    [
      `UPDATE k_newsletter_sends SET recipients = (SELECT COUNT(*) FROM k_newsletter_outbox WHERE send_id = ?1)
       WHERE id = ?1`,
      id
    ]
  ]);
  const made = await sendOf(env, id);
  if (!made)
    return { error: msg("Another send is under way. Finish or cancel it first."), status: 409 };
  if (!made.recipients) {
    await batch(env.DB, [
      ["DELETE FROM k_newsletter_letters WHERE send_id = ?", id],
      ["DELETE FROM k_newsletter_sends WHERE id = ?", id]
    ]);
    return { error: msg("No one is left to send this issue to."), status: 409 };
  }
  return { id };
}

const CHANGED = {
  error: msg("That send changed since you loaded it. Reload and try again."),
  status: 409
};

/** Arms a prepared send to start at `startsAt`: `count` must be the number of readers it holds now, and the start at
    least LEAD_MS and at most AHEAD_MS away. Its letters are checked again first, since a deploy since prepare may have
    taken a file they name away. */
export async function arm(
  env: Pick<Env, "DB">,
  adminId: string,
  id: string,
  count: number,
  startsAt: number,
  now = Date.now()
): Promise<Refusal> {
  const send = await sendOf(env, id);
  if (send?.state !== "prepared") return CHANGED;
  const queued = await first<{ n: number }>(
    env.DB,
    "SELECT COUNT(*) AS n FROM k_newsletter_outbox WHERE send_id = ? AND state = 'queued'",
    id
  );
  if (count !== queued?.n) return { error: msg("Type the number of people exactly."), status: 400 };
  if (startsAt < now + LEAD_MS)
    return { error: msg("Start at least 15 minutes from now."), status: 400 };
  if (startsAt > now + AHEAD_MS)
    return { error: msg("Start within the next 7 days."), status: 400 };
  const checks = await checkLetters([...(await lettersOf(env, id)).values()], send.origin);
  if (checks.problems.length) {
    return { error: "The issue did not pass its checks.", status: 422, problems: checks.problems };
  }
  const armed = await run(
    env.DB,
    `UPDATE k_newsletter_sends SET state = 'armed', starts_at = ?1, armed_by = ?2, armed_at = ?3, updated_at = ?3
     WHERE id = ?4 AND state = 'prepared'
       AND (SELECT COUNT(*) FROM k_newsletter_outbox WHERE send_id = ?4 AND state = 'queued') = ?5`,
    startsAt,
    adminId,
    now,
    id,
    count
  );
  return armed.changes ? null : CHANGED;
}

/** Pauses, resumes or cancels a send. Pausing holds an armed or sending send; resuming arms a paused one again, from
    now if its start has passed, so it goes on at the next minute; cancelling ends a send that is not sending, frees the
    readers it never handed to Resend for a later send, and marks the ones Resend may have taken unknown. */
export async function steer(
  env: Pick<Env, "DB">,
  id: string,
  action: "pause" | "resume" | "cancel",
  now = Date.now()
): Promise<Refusal> {
  if (action === "cancel") {
    const cancelled = `EXISTS (SELECT 1 FROM k_newsletter_sends WHERE id = ?1 AND state = 'cancelled')`;
    const [ended] = await batch(env.DB, [
      [
        `UPDATE k_newsletter_sends SET state = 'cancelled', updated_at = ?1, finished_at = ?1
         WHERE id = ?2 AND state IN ('prepared', 'armed', 'paused')`,
        now,
        id
      ],
      [
        `DELETE FROM k_newsletter_outbox WHERE send_id = ?1 AND state = 'queued' AND attempts = 0 AND ${cancelled}`,
        id
      ],
      [
        `UPDATE k_newsletter_outbox SET state = 'unknown' WHERE send_id = ?1 AND state = 'queued' AND attempts > 0
           AND ${cancelled}`,
        id
      ]
    ]);
    return ended?.meta.changes ? null : CHANGED;
  }
  const changed = await run(
    env.DB,
    action === "pause"
      ? `UPDATE k_newsletter_sends SET state = 'paused', reason = 'admin', updated_at = ?1 WHERE id = ?2
         AND state IN ('armed', 'sending')`
      : `UPDATE k_newsletter_sends SET state = 'armed', reason = NULL, starts_at = MAX(COALESCE(starts_at, 0), ?1),
           updated_at = ?1 WHERE id = ?2 AND state = 'paused'`,
    now,
    id
  );
  return changed.changes ? null : CHANGED;
}

async function lettersOf(env: Pick<Env, "DB">, id: string): Promise<Map<string, Stored>> {
  const rows = await all<Stored>(
    env.DB,
    "SELECT locale, subject, html, text FROM k_newsletter_letters WHERE send_id = ?",
    id
  );
  return new Map(rows.map(row => [row.locale, row]));
}

/* A reader's own copy of a send's letter: their token in its place, and the address their mail app's button posts
   to, in the letter's language. Null when the send has no letter or the token is not one. */
function personal(letters: Map<string, Stored>, origin: string, reader: Reader) {
  const letter = letters.get(reader.locale) ?? letters.get(DEFAULT_LOCALE);
  const token = reader.unsubscribe.slice(-64);
  if (!letter || !UNSUBSCRIBE_TOKEN.test(token)) return null;
  return {
    to: { ...reader, unsubscribe: origin + localizePath(`/unsubscribe/${token}`, letter.locale) },
    letter: {
      subject: letter.subject,
      html: letter.html.replaceAll(TOKEN_SLOT, token),
      text: letter.text.replaceAll(TOKEN_SLOT, token)
    }
  };
}

/** A send's letter to the admin alone, as their readers get it with the admin's own way out. */
export async function proof(env: Env, adminId: string, id: string): Promise<Refusal> {
  const send = await sendOf(env, id);
  if (!send) return CHANGED;
  const reader = await readerOf(env, send.origin, adminId);
  if (!reader)
    return { error: msg("Turn on the newsletter in Settings to send a test."), status: 409 };
  const copy = personal(await lettersOf(env, id), send.origin, reader);
  if (!copy) return CHANGED;
  try {
    await sendIssue(env, copy.to, copy.letter, { own: true });
  } catch (error) {
    console.error(
      "newsletter: the proof was not sent",
      error instanceof Error ? error.message : error
    );
    return { error: msg("Couldn't send the test. See the Worker's log."), status: 502 };
  }
  return null;
}

/** The latest sends, newest first, with their outbox counted; the issues that can be sent; whether the newsletter is
    on and whether this deploy reaches readers. */
export async function sendsAnswer(env: Env, now = Date.now()): Promise<SendsAnswer> {
  const rows = await all<SendRow>(
    env.DB,
    "SELECT * FROM k_newsletter_sends ORDER BY created_at DESC LIMIT ?",
    SHOWN
  );
  const counted = rows.length
    ? await all<{ send_id: string; state: string; n: number }>(
        env.DB,
        `SELECT send_id, state, COUNT(*) AS n FROM k_newsletter_outbox
         WHERE send_id IN (${rows.map(() => "?").join(", ")}) GROUP BY send_id, state`,
        ...rows.map(row => row.id)
      )
    : [];
  const titles = new Map(ISSUES.map(issue => [issue.number, issue.write(PRODUCTION_ORIGIN).title]));
  const sends = rows.map(
    (row): SendView => ({
      id: row.id,
      issue: row.issue,
      title: titles.get(row.issue) ?? "",
      segment: row.segment,
      state: row.state,
      recipients: row.recipients,
      leftOut: JSON.parse(row.left_out) as LeftOut,
      checks: JSON.parse(row.checks) as SendView["checks"],
      startsAt: row.starts_at,
      reason: row.reason,
      createdAt: row.created_at,
      armedAt: row.armed_at,
      finishedAt: row.finished_at,
      counts: Object.fromEntries(
        ["queued", "sending", "sent", "skipped", "failed", "unknown"].map(state => [
          state,
          counted.find(count => count.send_id === row.id && count.state === state)?.n ?? 0
        ])
      ) as SendView["counts"]
    })
  );
  return {
    sends,
    issues: published()
      .map(issue => ({ number: issue.number, title: titles.get(issue.number) ?? "" }))
      .reverse(),
    on: !(await flagOffNow(env, "newsletter")),
    reaches: reachesReaders(env),
    now
  };
}

/* The minute job. */

type Outcome =
  | "sent"
  | "skipped"
  | "failed"
  | "error"
  | "settled"
  | { stop: true }
  | { pause: PauseReason };

async function pause(env: Pick<Env, "DB">, id: string, reason: PauseReason, now: number) {
  await run(
    env.DB,
    `UPDATE k_newsletter_sends SET state = 'paused', reason = ?, updated_at = ? WHERE id = ?
     AND state IN ('armed', 'sending')`,
    reason,
    now,
    id
  );
  return { send: id, paused: reason };
}

/* a row this run holds, settled: sent, skipped, failed or unknown. False when another run settled it first */
async function settle(
  env: Pick<Env, "DB">,
  sendId: string,
  userId: string,
  state: "sent" | "skipped" | "failed" | "unknown",
  detail: { resendId?: string; error?: string } = {}
): Promise<boolean> {
  const done = await run(
    env.DB,
    `UPDATE k_newsletter_outbox SET state = ?, sent_at = ?, resend_id = ?, error = ?
     WHERE send_id = ? AND user_id = ? AND state = 'sending'`,
    state,
    state === "sent" ? Date.now() : null,
    detail.resendId ?? null,
    detail.error ?? null,
    sendId,
    userId
  );
  return done.changes > 0;
}

/* a row this run holds, back in the queue: as it is, or with its last try taken back where Resend refused the email
   outright and sent nothing */
const requeue = (
  env: Pick<Env, "DB">,
  sendId: string,
  userId: string,
  options: { untried?: boolean; error?: string } = {}
) =>
  run(
    env.DB,
    options.untried
      ? `UPDATE k_newsletter_outbox SET state = 'queued', attempts = attempts - 1,
           first_tried_at = CASE WHEN attempts = 1 THEN NULL ELSE first_tried_at END
         WHERE send_id = ? AND user_id = ? AND state = 'sending'`
      : `UPDATE k_newsletter_outbox SET state = 'queued', error = COALESCE(?, error)
         WHERE send_id = ? AND user_id = ? AND state = 'sending'`,
    ...(options.untried ? [sendId, userId] : [options.error ?? null, sendId, userId])
  );

/* the rows a run took and did not settle go back to the queue as they are; where an admin cancelled the send meanwhile,
   one never handed to Resend leaves it, free for a later send, and one Resend may have taken is unknown */
async function giveBack(env: Pick<Env, "DB">, sendId: string, userIds: readonly string[]) {
  if (!userIds.length) return;
  const cancelled =
    "EXISTS (SELECT 1 FROM k_newsletter_sends WHERE id = ?1 AND state = 'cancelled')";
  await batch(env.DB, [
    [
      `UPDATE k_newsletter_outbox SET state = 'queued' WHERE send_id = ? AND state = 'sending'
         AND user_id IN (${userIds.map(() => "?").join(", ")})`,
      sendId,
      ...userIds
    ],
    [
      `DELETE FROM k_newsletter_outbox WHERE send_id = ?1 AND state = 'queued' AND attempts = 0 AND ${cancelled}`,
      sendId
    ],
    [
      `UPDATE k_newsletter_outbox SET state = 'unknown' WHERE send_id = ?1 AND state = 'queued' AND attempts > 0
         AND ${cancelled}`,
      sendId
    ]
  ]);
}

/* one reader's email: what came of it, and whether the run goes on. A database that fails throws, and the run gives the
   row back */
async function deliverOne(
  env: Env,
  send: Pick<SendRow, "id" | "origin">,
  letters: Map<string, Stored>,
  row: { user_id: string; attempts: number },
  own: boolean
): Promise<Outcome> {
  const reader = await readerOf(env, send.origin, row.user_id);
  if (!reader) {
    const settled = await settle(env, send.id, row.user_id, "skipped", {
      error: "no longer subscribed"
    });
    return settled ? "skipped" : "settled";
  }
  const copy = personal(letters, send.origin, reader);
  if (!copy) {
    const settled = await settle(env, send.id, row.user_id, "failed", {
      error: "no letter for this reader"
    });
    return settled ? "failed" : "settled";
  }
  // the try is counted before the email goes, so a run that dies with it out leaves a row that says so
  await run(
    env.DB,
    `UPDATE k_newsletter_outbox SET attempts = attempts + 1, first_tried_at = COALESCE(first_tried_at, ?)
     WHERE send_id = ? AND user_id = ? AND state = 'sending'`,
    Date.now(),
    send.id,
    row.user_id
  );
  let resendId: string;
  try {
    resendId = await sendIssue(env, copy.to, copy.letter, {
      key: `newsletter/${send.id}/${row.user_id}`,
      own
    });
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    if (error instanceof NotReachable) {
      await settle(env, send.id, row.user_id, "failed", { error: said });
      return { pause: "reach" };
    }
    if (error instanceof ResendRefusal) {
      // the plan's emails are spent: nothing goes until an admin sees why
      if (error.code === "daily_quota_exceeded" || error.code === "monthly_quota_exceeded") {
        await requeue(env, send.id, row.user_id, { untried: true });
        return { pause: "quota" };
      }
      // Resend is busy: the next minute tries again
      if (error.status === 429) {
        await requeue(env, send.id, row.user_id, { untried: true });
        return { stop: true };
      }
      // another request with this key is still out: Resend may be sending it, so the try stands
      if (error.code === "concurrent_idempotent_requests") {
        await requeue(env, send.id, row.user_id);
        return { stop: true };
      }
      // a key Resend saw with another email: something changed the letter, which nothing should
      if (error.code === "invalid_idempotent_request") {
        await settle(env, send.id, row.user_id, "unknown", { error: said });
        return { pause: "changed" };
      }
      if (error.status === 401 || error.status === 403) {
        await requeue(env, send.id, row.user_id, { untried: true });
        return { pause: "key" };
      }
      // the address itself is refused: trying again changes nothing
      if (error.status === 400 || error.status === 422) {
        await settle(env, send.id, row.user_id, "failed", { error: said });
        return "failed";
      }
    }
    // Resend's own failure or no answer: tried again under the same key, which sends nothing twice
    if (row.attempts + 1 < ATTEMPTS) await requeue(env, send.id, row.user_id, { error: said });
    else await settle(env, send.id, row.user_id, "unknown", { error: said });
    return "error";
  }
  // Resend took it. A database that fails here leaves the row handed over, which a later run tries again under the same
  // key, and Resend answers that with the email it already sent
  return (await settle(env, send.id, row.user_id, "sent", { resendId })) ? "sent" : "settled";
}

/** The step the minute job runs: the send whose start has passed, at most PER_RUN emails of it while the newsletter
    is on. A report when it did something, else nothing. */
export async function deliverDue(env: Env, now = Date.now()) {
  const send = await first<SendRow>(
    env.DB,
    `SELECT * FROM k_newsletter_sends WHERE state IN ('armed', 'sending') ORDER BY created_at LIMIT 1`
  );
  if (!send?.starts_at || send.starts_at > now) return undefined;
  // a send not begun an hour past its start waits for an admin, rather than starting whenever the newsletter comes on
  if (send.state === "armed" && now > send.starts_at + LATE_MS)
    return pause(env, send.id, "late", now);
  if (await flagOffNow(env, "newsletter"))
    return { send: send.id, waiting: "the newsletter is off" };
  if (unsendable(env)) return pause(env, send.id, "sender", now);
  const lease = now + LEASE_MS;
  const held = await run(
    env.DB,
    `UPDATE k_newsletter_sends SET lease_until = ?1, updated_at = ?2
     WHERE id = ?3 AND state IN ('armed', 'sending') AND (lease_until IS NULL OR lease_until < ?2)`,
    lease,
    now,
    send.id
  );
  if (!held.changes) return undefined;
  try {
    if (send.state === "armed") {
      // its letters once more as it begins: a deploy since arming may have taken a file they name away
      const checks = await checkLetters([...(await lettersOf(env, send.id)).values()], send.origin);
      if (checks.problems.length) return pause(env, send.id, "links", now);
      await run(
        env.DB,
        "UPDATE k_newsletter_sends SET state = 'sending', updated_at = ? WHERE id = ? AND state = 'armed'",
        now,
        send.id
      );
    }
    return await deliver(env, send, now);
  } finally {
    // only its own lease: a run that outlived it leaves the next run's alone
    await run(
      env.DB,
      "UPDATE k_newsletter_sends SET lease_until = NULL WHERE id = ? AND lease_until = ?",
      send.id,
      lease
    );
  }
}

async function deliver(env: Env, send: SendRow, now: number) {
  const cutoff = now - RETRY_MS;
  await batch(env.DB, [
    // rows a run took and never settled: one never handed to Resend goes back; one handed over is tried again under its
    // own key while Resend still keeps the key
    [
      `UPDATE k_newsletter_outbox SET state = CASE WHEN attempts = 0 THEN 'queued'
         WHEN attempts < ?1 AND first_tried_at > ?2 THEN 'queued' ELSE 'unknown' END
       WHERE send_id = ?3 AND state = 'sending' AND tried_at < ?4`,
      ATTEMPTS,
      cutoff,
      send.id,
      now - STALE_MS
    ],
    // a row Resend may have taken a day ago or more is never tried again, since its key is gone
    [
      `UPDATE k_newsletter_outbox SET state = 'unknown'
       WHERE send_id = ?1 AND state = 'queued' AND attempts > 0 AND first_tried_at <= ?2`,
      send.id,
      cutoff
    ]
  ]);
  const day = await first<{ n: number }>(
    env.DB,
    "SELECT COUNT(*) AS n FROM k_newsletter_outbox WHERE sent_at > ?",
    now - 86_400_000
  );
  const room = Math.min(PER_RUN, DAILY - (day?.n ?? 0));
  if (room <= 0) return pause(env, send.id, "daily", now);
  const taken = await all<{ user_id: string; attempts: number }>(
    env.DB,
    `UPDATE k_newsletter_outbox SET state = 'sending', tried_at = ?1
     WHERE send_id = ?2 AND state = 'queued' AND user_id IN
       (SELECT user_id FROM k_newsletter_outbox WHERE send_id = ?2 AND state = 'queued' ORDER BY user_id LIMIT ?3)
     RETURNING user_id, attempts`,
    now,
    send.id,
    room
  );
  const report = { send: send.id, sent: 0, skipped: 0, failed: 0 };
  let paused: PauseReason | null = null;
  if (taken.length) {
    const started = Date.now();
    let streak = 0;
    // the first row this run has not settled, which goes back however the run ends
    let open = 0;
    try {
      const letters = await lettersOf(env, send.id);
      const admins = new Set(
        (await all<{ id: string }>(env.DB, "SELECT id FROM auth_user WHERE role = 'admin'")).map(
          row => row.id
        )
      );
      for (const [at, row] of taken.entries()) {
        const late = Date.now() - started > RUN_MS;
        // an admin's pause, or the newsletter turned off, holds the rest within ten emails
        if (late || (at > 0 && at % 10 === 0 && !(await stillSending(env, send.id)))) break;
        const outcome = await deliverOne(env, send, letters, row, admins.has(row.user_id));
        open = at + 1;
        if (outcome === "sent" || outcome === "skipped" || outcome === "failed") {
          report[outcome]++;
          streak = 0;
          continue;
        }
        if (outcome === "settled") continue;
        if (outcome === "error") {
          streak++;
          if (streak < STREAK) continue;
          paused = "errors";
        } else if ("pause" in outcome) paused = outcome.pause;
        break;
      }
    } finally {
      await giveBack(
        env,
        send.id,
        taken.slice(open).map(rest => rest.user_id)
      );
    }
  }
  if (paused) return { ...report, ...(await pause(env, send.id, paused, Date.now())) };
  const tally = await first<{ sent: number; bad: number; open: number }>(
    env.DB,
    `SELECT COALESCE(SUM(state = 'sent'), 0) AS sent, COALESCE(SUM(state IN ('failed', 'unknown')), 0) AS bad,
       COALESCE(SUM(state IN ('queued', 'sending')), 0) AS open
     FROM k_newsletter_outbox WHERE send_id = ?`,
    send.id
  );
  // nothing left is done, whatever failed on the way
  if (tally && !tally.open) {
    const finished = await run(
      env.DB,
      `UPDATE k_newsletter_sends SET state = 'done', finished_at = ?1, updated_at = ?1 WHERE id = ?2
       AND state = 'sending'`,
      Date.now(),
      send.id
    );
    return finished.changes ? { ...report, done: true } : report;
  }
  if (tally && tally.bad >= STREAK && tally.bad / (tally.sent + tally.bad) > FAILING) {
    return { ...report, ...(await pause(env, send.id, "failures", Date.now())) };
  }
  return report;
}

/* the send still sending and the newsletter still on, read fresh: a pause or the switch holds the rest at once */
async function stillSending(env: Env, id: string) {
  const row = await first<{ state: SendState }>(
    env.DB,
    "SELECT state FROM k_newsletter_sends WHERE id = ?",
    id
  );
  return row?.state === "sending" && !(await flagOffNow(env, "newsletter"));
}
