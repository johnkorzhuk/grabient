import { sql } from "drizzle-orm";
import { getDb } from "../database/setup";
import { auth_user } from "../drizzle/auth-schema";

// Username availability + update, ported from apps/user-application's
// server-functions/auth.ts: case-insensitive uniqueness, with an optional
// self-exclusion so a user can keep (or re-save casing on) their own name.
export async function isUsernameAvailable(
  username: string,
  excludeUserId?: string,
): Promise<boolean> {
  const db = getDb();
  const existing = await db
    .select({ id: auth_user.id })
    .from(auth_user)
    .where(sql`LOWER(${auth_user.username}) = LOWER(${username})`)
    .limit(1);
  return existing.length === 0 || existing[0]!.id === excludeUserId;
}

export async function updateUsername(userId: string, username: string): Promise<void> {
  const db = getDb();
  await db
    .update(auth_user)
    .set({ username })
    .where(sql`${auth_user.id} = ${userId}`);
}

export async function updateUserImage(userId: string, image: string): Promise<void> {
  const db = getDb();
  await db
    .update(auth_user)
    .set({ image, updatedAt: new Date() })
    .where(sql`${auth_user.id} = ${userId}`);
}
