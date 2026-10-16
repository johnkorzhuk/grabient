import type { NewsletterOptions } from "@grabient/email";
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  localizePath,
  msg,
  translate
} from "@grabient/i18n";
import { batch, first } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";

/* The newsletter's list (migrations 0051 and 0057). An account gets the newsletter until it says otherwise: with no
   row, or a row that holds no choice, it is subscribed. An account made where the law asks for a yes first
   (newsletter_opt_in) is the other way round: it gets none until it turns the newsletter on in Settings. It ends in
   Settings, on the page every issue links to, or by a mail app's own button, at once. Nothing here asks the rate
   limiter, so the newsletter can be ended while the limiter is down. */

/** Where a choice was made: Settings, the unsubscribe page, or a mail app's own button (RFC 8058). */
export type ChoiceSource = "settings" | "page" | "mail-app";
/* 32 random bytes as hex (UNSUBSCRIBE_TOKEN), never rotated: an account's way out lives as long as the account. */
const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
/* Whether an account gets the newsletter, 1 or 0, over `auth_user u LEFT JOIN k_newsletter n`: its own choice, or with
   none the newsletter unless the account waits for its yes. */
const SUBSCRIBED = "COALESCE(n.subscribed, NOT u.newsletter_opt_in, 1)";
const ACCOUNT = "auth_user u LEFT JOIN k_newsletter n ON n.user_id = u.id WHERE u.id = ?";

export async function isSubscribed(env: Pick<Env, "DB">, userId: string): Promise<boolean> {
  const row = await first<{ subscribed: number }>(
    env.DB,
    `SELECT ${SUBSCRIBED} AS subscribed FROM ${ACCOUNT}`,
    userId
  );
  return row?.subscribed !== 0;
}

/** The account's choice, kept with where it was made, in one transaction that writes nothing when the choice is
    already so: two presses at once log one change. A new row gets a token; a row keeps the one it has. */
export async function setSubscribed(
  env: Pick<Env, "DB">,
  userId: string,
  subscribed: boolean,
  source: ChoiceSource
): Promise<void> {
  const value = subscribed ? 1 : 0;
  const now = Date.now();
  const changes = `(SELECT ${SUBSCRIBED} FROM ${ACCOUNT}) <> ?`;
  await batch(env.DB, [
    [
      `INSERT INTO k_newsletter_events (user_id, subscribed, source, at) SELECT ?, ?, ?, ? WHERE ${changes}`,
      userId,
      value,
      source,
      now,
      userId,
      value
    ],
    [
      `INSERT INTO k_newsletter (user_id, token, subscribed, updated_at) SELECT ?, ?, ?, ? WHERE ${changes}
       ON CONFLICT (user_id) DO UPDATE SET subscribed = excluded.subscribed, updated_at = excluded.updated_at`,
      userId,
      newToken(),
      value,
      now,
      userId,
      value
    ]
  ]);
}

/** The account whose unsubscribe address this is, or null. */
export async function tokenOwner(env: Pick<Env, "DB">, token: string): Promise<string | null> {
  const row = await first<{ user_id: string }>(
    env.DB,
    "SELECT user_id FROM k_newsletter WHERE token = ?",
    token
  );
  return row?.user_id ?? null;
}

/** One account an issue goes to: its address, its language, and the whole address that ends the newsletter for it,
    which is both the issue's unsubscribe link and its List-Unsubscribe header. */
export interface Reader {
  email: string;
  locale: Locale;
  unsubscribe: string;
}
interface Choice {
  token: string | null;
  /** 1 or 0, as SUBSCRIBED reads it */
  subscribed: number;
}

/** One account as a reader, or null when it gets no newsletter or does not exist. An account no issue was addressed
    to before gets its row here, a token and no choice, read back in the same transaction: one that chose at that
    moment keeps the token its choice wrote, and is left out if it ended the newsletter. An account that waits for its
    yes gets no row until it chooses. */
export async function readerOf(
  env: Pick<Env, "DB">,
  origin: string,
  userId: string
): Promise<Reader | null> {
  const account = await first<Choice & { email: string; locale: string | null }>(
    env.DB,
    `SELECT u.email, u.locale, n.token, ${SUBSCRIBED} AS subscribed FROM ${ACCOUNT}`,
    userId
  );
  if (!account?.subscribed) return null;
  let choice: Choice | undefined = account;
  if (!account.token) {
    const results = await batch(env.DB, [
      [
        "INSERT INTO k_newsletter (user_id, token, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO NOTHING",
        userId,
        newToken(),
        Date.now()
      ],
      [`SELECT n.token, ${SUBSCRIBED} AS subscribed FROM ${ACCOUNT}`, userId]
    ]);
    choice = results.at(-1)?.results?.[0] as Choice | undefined;
  }
  if (!choice?.token || !choice.subscribed) return null;
  const locale = isLocale(account.locale) ? account.locale : DEFAULT_LOCALE;
  return {
    email: account.email,
    locale,
    unsubscribe: origin + localizePath(`/unsubscribe/${choice.token}`, locale)
  };
}

const REASON = msg("You get this because you signed up for Grabient.");
const UNSUBSCRIBE = msg("Unsubscribe");
/** An issue's foot for one reader, in the reader's language: why it came, and the press that ends it. */
export const issueFoot = (
  reader: Pick<Reader, "locale" | "unsubscribe">
): Pick<NewsletterOptions, "locale" | "reason" | "unsubscribe"> => ({
  locale: reader.locale,
  reason: translate(reader.locale, REASON),
  unsubscribe: { label: translate(reader.locale, UNSUBSCRIBE), href: reader.unsubscribe }
});
