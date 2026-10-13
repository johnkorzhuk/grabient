import { run } from "@grabient/server/db/d1.ts";
import { CURATION_COMMENT_MAX, curationReasons } from "@grabient/ui/curation.ts";
import { randomWord } from "./write.ts";

/* The admins' record (k_admin_actions): what an admin did to a palette or a collection, from the site's pages or a
   connected app. The seeding agents read it before each run: a removal means "keep it out". Each row keeps what it
   changed as it was and as it became, and names the collection by its id, address and title then, since the row
   outlives it. */

export type AdminActionKind =
  | "remove"
  | "delete"
  | "view"
  | "edit"
  | "collection.delete"
  | "collection.visibility"
  | "vote"
  | "note";

/** Why an admin did it: reasons from the one list, and a comment. */
export interface Why {
  reasons: string[];
  comment: string;
}
const cleanComment = (value: unknown): string =>
  typeof value === "string"
    ? value
        .normalize("NFC")
        .replace(/\p{Cc}/gu, " ")
        .replace(/\s+/gu, " ")
        .trim()
        .slice(0, CURATION_COMMENT_MAX)
    : "";
/** The reasons and the comment out of a body: the reasons kept to the list, the comment bounded. Absent is fine. */
export const parseWhy = (body: Readonly<Record<string, unknown>> | null | undefined): Why => ({
  reasons: curationReasons(body?.reasons),
  comment: cleanComment(body?.comment)
});

export interface AdminAction {
  actorId: string;
  action: AdminActionKind;
  seed?: string | null;
  collection?: { id: string; slug: string; title: string } | null;
  before?: unknown;
  after?: unknown;
  why?: Partial<Why> | null;
}

/** Puts one action on the record and answers its id. */
export async function recordAction(env: { DB: D1Database }, input: AdminAction): Promise<string> {
  const id = randomWord(20);
  await run(
    env.DB,
    `INSERT INTO k_admin_actions (id, actor_id, action, seed, collection_id, slug, title, before, after, reasons, comment,
       created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.actorId,
    input.action,
    input.seed ?? null,
    input.collection?.id ?? null,
    input.collection?.slug ?? null,
    input.collection?.title ?? null,
    input.before === undefined ? null : JSON.stringify(input.before),
    input.after === undefined ? null : JSON.stringify(input.after),
    JSON.stringify(curationReasons(input.why?.reasons)),
    cleanComment(input.why?.comment),
    Date.now()
  );
  return id;
}

/** An admin's removal taken back by its undo: the row goes, so the record says what stands. Only the admin's own
    removal of that palette. */
export async function forgetRemoval(
  env: { DB: D1Database },
  id: string,
  actorId: string,
  seed: string
): Promise<void> {
  await run(
    env.DB,
    "DELETE FROM k_admin_actions WHERE id = ? AND actor_id = ? AND action = 'remove' AND seed = ?",
    id,
    actorId,
    seed
  );
}
