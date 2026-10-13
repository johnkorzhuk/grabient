import type { Statement } from "../db/d1.ts";
import type { Env } from "../env.ts";

/** Everything a deleted account leaves, as one batch D1 applies whole or not at all. The account's row goes last but
    one: its sessions, Google link, newsletter rows and sync clients follow it by foreign key. The legacy likes, the
    votes on other people's collections and searches, and the sync log have no foreign key to it. Deleting its likes
    and collections writes log rows, so the log goes last. */
export function accountDeletion(userId: string): Statement[] {
  return [
    // The collections this account copied count one save fewer, recounted from the other accounts' copies.
    [
      `UPDATE k_collections SET fork_count = (
         SELECT COUNT(DISTINCT f.owner_id) FROM k_collections f
         WHERE f.forked_from = k_collections.id AND f.owner_kind = 'user' AND f.owner_id != ?)
       WHERE id IN (SELECT forked_from FROM k_collections
         WHERE owner_kind = 'user' AND owner_id = ? AND forked_from IS NOT NULL)`,
      userId,
      userId
    ],
    [
      "DELETE FROM k_collection_items WHERE collection_id IN (SELECT id FROM k_collections WHERE owner_kind = 'user' AND owner_id = ?)",
      userId
    ],
    ["DELETE FROM k_collections WHERE owner_kind = 'user' AND owner_id = ?", userId],
    ["DELETE FROM k_collection_votes WHERE user_id = ?", userId],
    ["DELETE FROM k_search_votes WHERE user_id = ?", userId],
    ["DELETE FROM k_likes WHERE user_id = ?", userId],
    ["DELETE FROM likes WHERE user_id = ?", userId],
    ["DELETE FROM refine_sessions WHERE user_id = ?", userId],
    ["DELETE FROM auth_user WHERE id = ?", userId],
    ["DELETE FROM k_sync_log WHERE account_id = ?", userId]
  ];
}

/** Every object under an account's avatar prefix but `keep`: the current picture and any an interrupted upload left. */
export async function deleteAvatars(
  env: Pick<Env, "UPLOADS">,
  userId: string,
  keep?: string
): Promise<number> {
  if (!env.UPLOADS) return 0;
  let removed = 0;
  let cursor: string | undefined;
  do {
    const page = await env.UPLOADS.list({ prefix: `avatars/${userId}/`, cursor, limit: 1000 });
    const keys = page.objects.map(object => object.key).filter(key => key !== keep);
    if (keys.length) await env.UPLOADS.delete(keys);
    removed += keys.length;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return removed;
}
