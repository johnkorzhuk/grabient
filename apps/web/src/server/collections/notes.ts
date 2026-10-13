import { all, first, run } from "@grabient/server/db/d1.ts";
import type { CollectionNote } from "../../features/collections/types.ts";
import type { Reader } from "./read.ts";
import { randomWord } from "./write.ts";

/* Notes an admin leaves the seeding agents about a collection, on any collection. A note keeps the palettes the
   collection held when it was written, so it says later whether it is about the palettes now. */

interface NoteRow {
  id: string;
  text: string;
  created_at: number;
  username: string | null;
  name: string | null;
  items_then: string | null;
}
const NOTE = `SELECT n.id, n.text, n.created_at, n.items_then, u.username, u.name
  FROM k_collection_notes n LEFT JOIN auth_user u ON u.id = n.author_id`;
const NOTES_MAX = 200;

function seedsThen(raw: string | null): string[] | undefined {
  if (!raw) return undefined;
  try {
    const list: unknown = JSON.parse(raw);
    return Array.isArray(list)
      ? list.filter((seed): seed is string => typeof seed === "string")
      : undefined;
  } catch {
    return undefined;
  }
}
function noteFrom(row: NoteRow, now: readonly string[]): CollectionNote {
  const note: CollectionNote = {
    id: row.id,
    text: row.text,
    createdAt: Number(row.created_at),
    author: row.name?.trim() || (row.username ? `@${row.username}` : "Admin")
  };
  const then = seedsThen(row.items_then);
  if (!then) return note;
  const held = new Set(now);
  const was = new Set(then);
  return {
    ...note,
    itemsThen: then,
    heldThen: then.length,
    changedSince: then.filter(seed => !held.has(seed)).length,
    addedSince: now.filter(seed => !was.has(seed)).length
  };
}
const seedsHeld = async (env: Reader, collectionId: string) =>
  (
    await all<{ seed: string }>(
      env.DB,
      "SELECT seed FROM k_collection_items WHERE collection_id = ? ORDER BY position",
      collectionId
    )
  ).map(row => row.seed);

/** A collection's notes, oldest first. */
export async function listNotes(env: Reader, collectionId: string): Promise<CollectionNote[]> {
  const [rows, now] = await Promise.all([
    all<NoteRow>(
      env.DB,
      `${NOTE} WHERE n.collection_id = ? ORDER BY n.created_at, n.id LIMIT ?`,
      collectionId,
      NOTES_MAX
    ),
    seedsHeld(env, collectionId)
  ]);
  return rows.map(row => noteFrom(row, now));
}

/** A note written over the palettes the collection holds now. */
export async function addNote(
  env: { DB: D1Database },
  collectionId: string,
  authorId: string,
  text: string
): Promise<CollectionNote> {
  const id = randomWord(20);
  const held = await seedsHeld(env, collectionId);
  await run(
    env.DB,
    "INSERT INTO k_collection_notes (id, collection_id, author_id, text, created_at, items_then) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    collectionId,
    authorId,
    text,
    Date.now(),
    JSON.stringify(held)
  );
  const row = await first<NoteRow>(env.DB, `${NOTE} WHERE n.id = ?`, id);
  if (!row) throw new Error("The note was not written");
  return noteFrom(row, held);
}

export async function deleteNote(
  env: { DB: D1Database },
  collectionId: string,
  id: string
): Promise<boolean> {
  return (
    (
      await run(
        env.DB,
        "DELETE FROM k_collection_notes WHERE id = ? AND collection_id = ?",
        id,
        collectionId
      )
    ).changes > 0
  );
}
