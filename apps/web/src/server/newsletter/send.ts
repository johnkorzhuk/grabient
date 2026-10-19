import type { Letter } from "@grabient/email";
import { CONTACT_EMAIL } from "@grabient/email/addresses.ts";
import { msg } from "@grabient/i18n";
import type { Env } from "@grabient/server/env.ts";
import { PRODUCTION_ORIGIN } from "../../lib/page-meta.ts";
import type { Reader } from "./list.ts";

/* An issue goes through Resend, never the EMAIL binding: Email Service takes only the emails a reader asked for. Its
   callers pass every send through the newsletter flag first and keep count of what they sent. */

const RESEND = "https://api.resend.com/emails";
/* Resend answers in well under a second; one that hangs must not hold a request open. */
const RESEND_TIMEOUT_MS = 10_000;
/* Resend's own addresses that act out a delivery, a bounce, a complaint and a suppression without reaching anyone. */
const RESEND_TESTS = /@resend\.dev$/i;

type SendEnv = Pick<Env, "RESEND_API_KEY" | "NEWSLETTER_FROM" | "DEPLOYMENT" | "PUBLIC_ORIGIN">;

/** Why no issue can go out from this deploy, as an admin is told it, or null. */
export const unsendable = (env: Pick<Env, "RESEND_API_KEY" | "NEWSLETTER_FROM">) =>
  env.RESEND_API_KEY && env.NEWSLETTER_FROM
    ? null
    : msg("The newsletter has no sender yet. Add the RESEND_API_KEY secret.");

/** Whether this deploy may send an issue to readers: production at grabient.com alone. Staging holds a copy of
    production's accounts, so it and every other deploy send only to Resend's test addresses and to an admin's own. */
export const reachesReaders = (env: Pick<Env, "DEPLOYMENT" | "PUBLIC_ORIGIN">) =>
  env.DEPLOYMENT === "production" && env.PUBLIC_ORIGIN === PRODUCTION_ORIGIN;

/** Thrown before Resend is asked, when this deploy may not reach the address. */
export class NotReachable extends Error {}

/** Resend's refusal: its status and its error's name, which say whether trying again can help. */
export class ResendRefusal extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(`Resend answered ${status}${code ? ` ${code}` : ""}`);
    this.status = status;
    this.code = code;
  }
}

/** One issue to one reader. Its headers give a mail app its own unsubscribe button, which posts to the reader's
    address (routes.ts, `unsubscribeResponse`). `key` is Resend's idempotency key: the same key within a day sends
    nothing again. `own` says the address is the asking admin's. Answers Resend's id for the email; throws a
    ResendRefusal with Resend's own words when it refuses, and before asking when this deploy may not reach the
    address (NotReachable). */
export async function sendIssue(
  env: SendEnv,
  reader: Reader,
  letter: Letter,
  options: { key?: string; own?: boolean } = {}
): Promise<string> {
  if (!env.RESEND_API_KEY || !env.NEWSLETTER_FROM) throw new Error("The newsletter has no sender");
  if (!reachesReaders(env) && !options.own && !RESEND_TESTS.test(reader.email)) {
    throw new NotReachable("Only production sends an issue to readers");
  }
  const response = await fetch(RESEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      ...(options.key ? { "Idempotency-Key": options.key } : {})
    },
    body: JSON.stringify({
      from: `Grabient <${env.NEWSLETTER_FROM}>`,
      to: [reader.email],
      reply_to: CONTACT_EMAIL,
      subject: letter.subject,
      html: letter.html,
      text: letter.text,
      headers: {
        "List-Unsubscribe": `<${reader.unsubscribe}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
      }
    }),
    signal: AbortSignal.timeout(RESEND_TIMEOUT_MS)
  });
  const answer = (await response.json().catch(() => null)) as {
    id?: string;
    name?: string;
    message?: string;
  } | null;
  if (!response.ok) {
    const refusal = new ResendRefusal(response.status, answer?.name ?? "");
    if (answer?.message) refusal.message += `: ${answer.message}`;
    throw refusal;
  }
  return answer?.id ?? "";
}
