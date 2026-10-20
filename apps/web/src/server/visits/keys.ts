import type { Env } from "@grabient/server/env.ts";

/* The day's key a visitor's code is made with (visits.ts): 32 random bytes in KV under visit-key:<UTC day>, made a day
   ahead by the ten-minute job, so every data center holds a day's key before its first visit, and kept until ten
   minutes past its day's end, when KV deletes it. */

const DAY = 86_400_000;
/** How long KV keeps a day's key past the day's end, for requests that began just before it. */
const KEY_GRACE_S = 600;

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const keyName = (day: string) => `visit-key:${day}`;
export const hex = (bytes: Uint8Array) =>
  [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");

/** Today's key and tomorrow's, each made where none is kept: the ten-minute job's step. It answers the days it made a
    key for. */
export async function makeVisitKeys(
  env: Pick<Env, "CACHE">,
  now = Date.now()
): Promise<string[] | { skipped: string }> {
  const store = env.CACHE;
  if (!store) return { skipped: "no KV" };
  const made: string[] = [];
  for (const day of [dayOf(now), dayOf(now + DAY)]) {
    if (await store.get(keyName(day))) continue;
    const ends = Date.parse(`${day}T00:00:00Z`) + DAY;
    await store.put(keyName(day), hex(crypto.getRandomValues(new Uint8Array(32))), {
      expiration: Math.floor(ends / 1000) + KEY_GRACE_S
    });
    made.push(day);
  }
  return made;
}
