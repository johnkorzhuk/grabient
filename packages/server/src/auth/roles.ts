import { first } from "../db/d1.ts";
import type { Env } from "../env.ts";

/* Who may do what, read from the database at the moment it matters: never from a session's signed copy, which can be
   minutes old, so a role taken away counts at the next request. */

export type Role = "admin" | "user";

/** An account's role, or null when there is no such account. */
export async function accountRole(env: Pick<Env, "DB">, userId: string): Promise<Role | null> {
  const row = await first<{ role: string }>(
    env.DB,
    "SELECT role FROM auth_user WHERE id = ?",
    userId
  );
  if (!row) return null;
  return row.role === "admin" ? "admin" : "user";
}

/** Whether an address is the app reviewers' account, the one account that signs in with a password. */
export function reviewerAddress(env: Pick<Env, "REVIEWER_EMAIL">, email: string): boolean {
  const reviewer = env.REVIEWER_EMAIL?.trim().toLowerCase();
  return Boolean(reviewer) && email.trim().toLowerCase() === reviewer;
}
