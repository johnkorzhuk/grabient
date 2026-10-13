/* The searches an admin's app schedules to lead the tags (the search_tags tool): each stands from a start to an end by
   its dates alone, so nothing runs for one to begin or end. Only a search the vocabulary answers as one phrase is kept,
   in the form its tag says it, so every tag finds palettes and none asks the model. */
import { all, run } from "../db/d1.ts";
import type { Env } from "../env.ts";
import { loadVocabulary } from "./files.ts";
import { forgetPopular, tagWords } from "./popular.ts";
import { normalizeListQuery } from "./seams.ts";
import { suggestSearches } from "./tags.ts";

const DAY = 86_400_000;
/** how far ahead a search may start, how long one may stand, and how long one stands when no end is given */
export const SCHEDULE_AHEAD_DAYS = 400;
export const SCHEDULE_SPAN_DAYS = 120;
export const SCHEDULE_DEFAULT_DAYS = 7;
/** how many searches one call schedules */
export const SCHEDULE_MAX = 48;
/** an ended search is kept this long as a record, then deleted by the six-hourly upkeep */
const KEEP_DAYS = 30;

export interface ScheduledSearch {
  id: string;
  words: string;
  startsAt: number;
  endsAt: number;
  position: number;
  label: string;
}
/** A search not scheduled: the words as sent, why, and for words the vocabulary does not answer, the nearest that would stand. */
export interface RefusedSearch {
  words: string;
  why: string;
  nearest?: string[];
}

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)), b => ALPHABET[b % ALPHABET.length]).join(
    ""
  );
const DAY_ALONE = /^\d{4}-\d{2}-\d{2}$/;
/* a day (2026-10-20, its first moment in UTC) or a moment (ISO 8601) as a time; null for anything else */
function moment(value: unknown): number | null {
  const at =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Date.parse(value.trim())
        : Number.NaN;
  return Number.isFinite(at) ? at : null;
}
const unsaid = (value: unknown) => value === undefined || value === null || value === "";

/** Schedules searches to lead the tags, in the order sent. `from` is a day or a moment, now when left out; `until` is the
    last day it stands (a day alone runs to its end), SCHEDULE_DEFAULT_DAYS after its start when left out. The same
    words scheduled again for the same start keep their row and take the new end, order and label. */
export async function scheduleSearches(
  env: Env,
  userId: string,
  entries: readonly { words?: unknown; from?: unknown; until?: unknown }[],
  label = "",
  now = Date.now()
): Promise<{ scheduled: number; refused: RefusedSearch[] }> {
  const vocabulary = await loadVocabulary(env);
  if (!vocabulary) throw new Error("The search vocabulary is not available");
  const rows: [string, string, number, number, number][] = [];
  const refused: RefusedSearch[] = [];
  for (const [position, entry] of entries.slice(0, SCHEDULE_MAX).entries()) {
    const sent =
      typeof entry.words === "string" ? entry.words.normalize("NFKC").trim().slice(0, 100) : "";
    const asked = normalizeListQuery(sent);
    const words = asked && tagWords(vocabulary, asked);
    if (!words) {
      const nearest = asked ? (await suggestSearches(env, asked, 4)).map(tag => tag.query) : [];
      refused.push({
        words: sent,
        why: "The site does not answer these words as one search of its vocabulary.",
        nearest
      });
      continue;
    }
    const startsAt = unsaid(entry.from) ? now : moment(entry.from);
    const until = unsaid(entry.until) ? null : moment(entry.until);
    if (startsAt === null || (!unsaid(entry.until) && until === null)) {
      refused.push({
        words: sent,
        why: "from and until are a day (2026-10-20) or a moment (ISO 8601)."
      });
      continue;
    }
    // a day alone as the last day runs to its end
    const endsAt =
      until === null
        ? startsAt + SCHEDULE_DEFAULT_DAYS * DAY
        : until + (typeof entry.until === "string" && DAY_ALONE.test(entry.until.trim()) ? DAY : 0);
    if (endsAt <= startsAt || endsAt <= now) {
      refused.push({ words: sent, why: "It ends before it starts, or has ended already." });
      continue;
    }
    if (startsAt > now + SCHEDULE_AHEAD_DAYS * DAY) {
      refused.push({ words: sent, why: `It starts more than ${SCHEDULE_AHEAD_DAYS} days ahead.` });
      continue;
    }
    if (endsAt - startsAt > SCHEDULE_SPAN_DAYS * DAY) {
      refused.push({ words: sent, why: `It stands longer than ${SCHEDULE_SPAN_DAYS} days.` });
      continue;
    }
    rows.push([newId(), words, startsAt, endsAt, position]);
  }
  if (rows.length) {
    await run(
      env.DB,
      `INSERT INTO k_scheduled_searches (id, words, starts_at, ends_at, position, label, created_by, created_at)
       SELECT json_extract(value, '$[0]'), json_extract(value, '$[1]'), json_extract(value, '$[2]'),
         json_extract(value, '$[3]'), json_extract(value, '$[4]'), ?, ?, ? FROM json_each(?) WHERE true
       ON CONFLICT (words, starts_at) DO UPDATE SET ends_at = excluded.ends_at, position = excluded.position,
         label = excluded.label`,
      label,
      userId,
      now,
      JSON.stringify(rows)
    );
    forgetPopular(env);
  }
  return { scheduled: rows.length, refused };
}

/** What is scheduled and has not ended, the soonest first. */
export async function listScheduled(
  env: Pick<Env, "DB">,
  now = Date.now()
): Promise<ScheduledSearch[]> {
  const rows = await all<{
    id: string;
    words: string;
    starts_at: number;
    ends_at: number;
    position: number;
    label: string;
  }>(
    env.DB,
    "SELECT id, words, starts_at, ends_at, position, label FROM k_scheduled_searches WHERE ends_at > ? ORDER BY starts_at, position, words LIMIT 500",
    now
  );
  return rows.map(row => ({
    id: row.id,
    words: row.words,
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    position: Number(row.position),
    label: row.label
  }));
}

/** Takes scheduled searches out, by their ids or by the label of their batch. How many went. */
export async function removeScheduled(
  env: Pick<Env, "DB">,
  by: { ids?: readonly string[]; label?: string }
): Promise<number> {
  const ids = (by.ids ?? []).filter(id => /^[a-z0-9]{20}$/.test(id));
  const label = by.label ?? "";
  if (!ids.length && !label) return 0;
  const meta = label
    ? await run(
        env.DB,
        "DELETE FROM k_scheduled_searches WHERE id IN (SELECT value FROM json_each(?)) OR label = ?",
        JSON.stringify(ids),
        label
      )
    : await run(
        env.DB,
        "DELETE FROM k_scheduled_searches WHERE id IN (SELECT value FROM json_each(?))",
        JSON.stringify(ids)
      );
  forgetPopular(env);
  return Number(meta.changes) || 0;
}

/** Every six hours: the searches that ended KEEP_DAYS ago are deleted. */
export async function pruneScheduled(env: Pick<Env, "DB">, now = Date.now()): Promise<number> {
  const meta = await run(
    env.DB,
    "DELETE FROM k_scheduled_searches WHERE ends_at < ?",
    now - KEEP_DAYS * DAY
  );
  return Number(meta.changes) || 0;
}
