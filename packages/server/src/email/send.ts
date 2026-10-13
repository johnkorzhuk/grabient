import type { Env } from "../env.ts";
import type { LimitCheck } from "../limits/check.ts";

/* Every email the site sends goes out here, through Email Service, from the one address the EMAIL binding may send
   from. Each kind of email has limits it passes first: its inbox's few a day, and the kind's ceilings for the whole
   site. The caller counts them before anything is stored or sent, since a refused email must leave nothing behind. */

export interface Email {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

/** Throws when the deploy has no EMAIL binding or Email Service refuses the message. */
export async function sendEmail(
  env: Pick<Env, "EMAIL" | "EMAIL_FROM">,
  email: Email
): Promise<void> {
  if (!env.EMAIL) throw new Error("Email delivery is not configured");
  await env.EMAIL.send({ from: { name: "Grabient", email: env.EMAIL_FROM }, ...email });
}

/** The inbox an address reaches, as its emails are counted: one key whatever its case, a +tag or, at Gmail, its dots,
    so a script cannot send one person a stack of emails by writing their address many ways. */
export function inboxOf(email: string): string {
  const address = email.trim().toLowerCase();
  const at = address.lastIndexOf("@");
  if (at < 1) return address;
  const name = address.slice(0, at);
  const domain = address.slice(at + 1);
  const local = name.replace(/\+.*$/, "") || name;
  return domain === "gmail.com" || domain === "googlemail.com"
    ? `${local.replaceAll(".", "")}@gmail.com`
    : `${local}@${domain}`;
}

const inboxLimit = (email: string): LimitCheck => [`email-to:${inboxOf(email)}`, "emailRecipient"];

/** A sign-in link or code: its inbox's day, then the site's hour and day of sign-in mail. */
export const signInEmailLimits = (email: string): LimitCheck[] => [
  inboxLimit(email),
  ["email-sign-in", "magicLinkGlobal"],
  ["email-sign-in-day", "magicLinkDaily"]
];

/** An account deletion's confirmation: its inbox's day, then the site's day of deletion mail, which sign-in requests
    never spend. */
export const deletionEmailLimits = (email: string): LimitCheck[] => [
  inboxLimit(email),
  ["email-deletion-day", "deletionEmail"]
];
