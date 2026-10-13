import type { NewsletterOptions } from "@grabient/email";
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  localizePath,
  msg,
  translate
} from "@grabient/i18n";
import { all, batch, first, type Statement } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";

/* The newsletter's list (migration 0051). An account gets the newsletter until it says otherwise: with no row, or a row
   that holds no choice, it is subscribed. It ends in Settings, on the page every issue links to, or by a mail app's own
   button, at once. Nothing here asks the rate limiter, so the newsletter can be ended while the limiter is down. */

/** Where a choice was made: Settings, the unsubscribe page, or a mail app's own button (RFC 8058). */
export type ChoiceSource = "settings" | "page" | "mail-app";
/* 32 random bytes as hex (UNSUBSCRIBE_TOKEN), never rotated: an account's way out lives as long as the account. */
const newToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), byte =>
    byte.toString(16).padStart(2, "0")
  ).join("");
/* A row with no choice, or no row, is a subscription: what the SQL below reads with COALESCE(subscribed, 1). */
const subscribedBy = (held: number | null | undefined) => held !== 0;

export async function isSubscribed(env: Pick<Env, "DB">, userId: string): Promise<boolean> {
  const row = await first<{ subscribed: number | null }>(
    env.DB,
    "SELECT subscribed FROM k_newsletter WHERE user_id = ?",
    userId
  );
  return subscribedBy(row?.subscribed);
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
  const changes = "COALESCE((SELECT subscribed FROM k_newsletter WHERE user_id = ?), 1) <> ?";
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
interface Account {
  id: string;
  email: string;
  locale: string | null;
  token: string | null;
  subscribed: number | null;
}
const ACCOUNT =
  "u.id, u.email, u.locale, n.token, n.subscribed FROM auth_user u LEFT JOIN k_newsletter n ON n.user_id = u.id";

/* Each account with its unsubscribe address. An account no issue was addressed to before gets its row here, a token
   and no choice, and the rows are read back in the same transaction: one that chose at that moment keeps the token its
   choice wrote, and is left out if it ended the newsletter. */
async function readersOf(env: Pick<Env, "DB">, origin: string, accounts: readonly Account[]) {
  const held = new Map(accounts.map(account => [account.id, account] as const));
  const fresh = accounts.filter(account => !account.token).map(account => account.id);
  if (fresh.length) {
    const now = Date.now();
    const statements: Statement[] = fresh.map(id => [
      "INSERT INTO k_newsletter (user_id, token, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO NOTHING",
      id,
      newToken(),
      now
    ]);
    statements.push([
      `SELECT user_id, token, subscribed FROM k_newsletter WHERE user_id IN (${fresh.map(() => "?").join(",")})`,
      ...fresh
    ]);
    const results = await batch(env.DB, statements);
    const rows = (results.at(-1)?.results ?? []) as {
      user_id: string;
      token: string;
      subscribed: number | null;
    }[];
    for (const row of rows) {
      const account = held.get(row.user_id);
      if (account)
        held.set(row.user_id, { ...account, token: row.token, subscribed: row.subscribed });
    }
  }
  return [...held.values()].flatMap((account): Reader[] => {
    if (!account.token || !subscribedBy(account.subscribed)) return [];
    const locale = isLocale(account.locale) ? account.locale : DEFAULT_LOCALE;
    return [
      {
        email: account.email,
        locale,
        unsubscribe: origin + localizePath(`/unsubscribe/${account.token}`, locale)
      }
    ];
  });
}

/** The most readers a page holds: a statement's bound values, and one request to the sender. */
export const READERS_PAGE = 100;

/** The accounts an issue goes to, a page at a time in the order of their ids: every account with a verified address that
    has not ended the newsletter. `next` is the `after` of the next page, or null at the end. The choice is read as
    each page is taken, so a long send never writes to an account that ended the newsletter before its page. */
export async function newsletterReaders(
  env: Pick<Env, "DB">,
  origin: string,
  options: { after?: string; limit?: number } = {}
): Promise<{ readers: Reader[]; next: string | null }> {
  const limit = Math.max(1, Math.min(READERS_PAGE, Math.floor(options.limit ?? READERS_PAGE)));
  const accounts = await all<Account>(
    env.DB,
    `SELECT ${ACCOUNT} WHERE u.id > ? AND u.email_verified = 1 AND COALESCE(n.subscribed, 1) = 1
     ORDER BY u.id LIMIT ?`,
    options.after ?? "",
    limit
  );
  return {
    readers: await readersOf(env, origin, accounts),
    next: accounts.length === limit ? accounts[limit - 1].id : null
  };
}

/** One account as a reader, or null when it ended the newsletter or does not exist. */
export async function readerOf(
  env: Pick<Env, "DB">,
  origin: string,
  userId: string
): Promise<Reader | null> {
  const account = await first<Account>(env.DB, `SELECT ${ACCOUNT} WHERE u.id = ?`, userId);
  return account ? ((await readersOf(env, origin, [account]))[0] ?? null) : null;
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
