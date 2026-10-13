import type { Letter } from "@grabient/email";
import { CONTACT_EMAIL } from "@grabient/email/addresses.ts";
import { msg } from "@grabient/i18n";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import type { Reader } from "./list.ts";

/* An issue goes through Resend, never the EMAIL binding: Email Service takes only the emails a reader asked for. Every
   send passes the newsletter flag first, and is counted against the site's day (newsletterDaily) by its caller. */

const RESEND = "https://api.resend.com/emails";
/* Resend answers in well under a second; one that hangs must not hold a request open. */
const RESEND_TIMEOUT_MS = 10_000;

/** Why no issue can go out now, as an admin is told it, or null. */
export async function unsendable(env: Pick<Env, "DB" | "RESEND_API_KEY" | "NEWSLETTER_FROM">) {
  if (await flagOff(env, "newsletter"))
    return msg("The newsletter is turned off in Site features.");
  return env.RESEND_API_KEY && env.NEWSLETTER_FROM
    ? null
    : msg("The newsletter has no sender yet. Add the RESEND_API_KEY secret.");
}

/** One issue to one reader. Its headers give a mail app its own unsubscribe button, which posts to the reader's
    address (routes.ts, `unsubscribeResponse`). Throws with Resend's own words when it refuses. */
export async function sendIssue(
  env: Pick<Env, "RESEND_API_KEY" | "NEWSLETTER_FROM">,
  reader: Reader,
  letter: Letter
): Promise<void> {
  if (!env.RESEND_API_KEY || !env.NEWSLETTER_FROM) throw new Error("The newsletter has no sender");
  const response = await fetch(RESEND, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
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
  if (!response.ok) {
    const refusal = (await response.json().catch(() => null)) as {
      name?: string;
      message?: string;
    } | null;
    throw new Error(
      `Resend answered ${response.status}${refusal?.name ? ` ${refusal.name}` : ""}${refusal?.message ? `: ${refusal.message}` : ""}`
    );
  }
}
