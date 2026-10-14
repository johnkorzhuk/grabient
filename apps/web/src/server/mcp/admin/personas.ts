import { all, batch, type Statement } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";

/* The personas: the accounts scheduled likes are made with. A like's key is (account, palette) and the hot order reads
   likes, so a persona is a real auth_user row, marked in k_personas. It has no credentials, no session and an address
   that cannot receive mail, so nothing signs in as it; it owns nothing and is shown nowhere. `taste` is the planner's
   note of what it goes for, kept beside it so every plan reads the same list. */

/** The one agent the site's public collections, queue and personas belong to. */
export const SITE_AGENT = "grabient";
/** It as the owner of the collections the site publishes. */
export const SITE_OWNER = { kind: "agent", id: SITE_AGENT } as const;

export interface PersonaInput {
  handle: string;
  name: string;
  taste: string[];
}
const TASTE_MAX = 12;
const HANDLE = /^[a-z][a-z0-9-]{1,23}$/;
const TASTE_WORD = /^[a-z][a-z0-9 -]{0,23}$/;

export const personaId = (handle: string) => `persona-${handle}`;

/** A persona as a call sends it: a handle, a name (the handle when none) and up to twelve distinct taste words; null
    for a handle that is not one. */
export function personaInput(raw: unknown): PersonaInput | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.handle !== "string" || !HANDLE.test(value.handle)) return null;
  const name =
    typeof value.name === "string" && value.name.trim()
      ? value.name.trim().slice(0, 40)
      : value.handle;
  const words = Array.isArray(value.taste)
    ? value.taste.filter(
        (word): word is string => typeof word === "string" && TASTE_WORD.test(word)
      )
    : [];
  return { handle: value.handle, name, taste: [...new Set(words.slice(0, TASTE_MAX))] };
}

/** The ids of the personas: what the queue checks a like's actor against. */
export async function personaIds(env: Pick<Env, "DB">): Promise<Set<string>> {
  const rows = await all<{ user_id: string }>(
    env.DB,
    "SELECT user_id FROM k_personas WHERE agent = ?",
    SITE_AGENT
  );
  return new Set(rows.map(row => row.user_id));
}

export async function listPersonas(env: Pick<Env, "DB">) {
  const rows = await all<{
    user_id: string;
    handle: string;
    taste: string;
    name: string | null;
    likes: number;
  }>(
    env.DB,
    `SELECT p.user_id, p.handle, p.taste, u.name, (SELECT COUNT(*) FROM k_likes l WHERE l.user_id = p.user_id) AS likes
     FROM k_personas p LEFT JOIN auth_user u ON u.id = p.user_id WHERE p.agent = ? ORDER BY p.created_at, p.handle`,
    SITE_AGENT
  );
  return rows.map(row => {
    let taste: string[] = [];
    try {
      const parsed: unknown = JSON.parse(row.taste);
      if (Array.isArray(parsed))
        taste = parsed.filter((word): word is string => typeof word === "string");
    } catch {
      // read as no taste
    }
    return {
      handle: row.handle,
      name: row.name ?? row.handle,
      taste,
      likes: Number(row.likes) || 0
    };
  });
}

/** Makes the personas a plan names and rewrites the taste of those that exist. */
export async function ensurePersonas(
  env: Pick<Env, "DB">,
  wanted: readonly PersonaInput[]
): Promise<number> {
  if (!wanted.length) return 0;
  const now = Date.now();
  await batch(
    env.DB,
    wanted.flatMap((persona): Statement[] => {
      const id = personaId(persona.handle);
      return [
        [
          `INSERT INTO auth_user (id, name, email, email_verified, role, created_at, updated_at)
           VALUES (?, ?, ?, 1, 'user', ?, ?) ON CONFLICT(id) DO NOTHING`,
          id,
          persona.name,
          `${persona.handle}@personas.grabient.invalid`,
          now,
          now
        ],
        [
          `INSERT INTO k_personas (user_id, agent, handle, taste, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET taste = excluded.taste`,
          id,
          SITE_AGENT,
          persona.handle,
          JSON.stringify(persona.taste),
          now
        ]
      ];
    })
  );
  return wanted.length;
}
