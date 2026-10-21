import type { Env } from "@grabient/server/env.ts";

/* The day's key a visitor's code is made with (visits.ts): 32 random bytes in KV under visit-key:<UTC day>, made a day
   ahead by the ten-minute job, so every data center holds a day's key before its first visit, and kept until ten
   minutes past its day's end, when KV deletes it. */

const DAY = 86_400_000;
/** How long KV keeps a day's key past the day's end, for requests that began just before it. */
const KEY_GRACE_S = 600;

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const keyName = (day: string) => `visit-key:${day}`;
/** Chrome's stable version, which the feed to Google Analytics (ga4.ts) and the site_visits tool weigh a Chromium
    against: { day, lead }. */
export const leadName = "visit-lead";
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

/** Google's release dashboard: the newest stable Chrome for Windows, its milestone the major version. */
const STABLE =
  "https://chromiumdash.appspot.com/fetch_releases?channel=Stable&platform=Windows&num=1";
const ASK_MS = 5000;

/** Chrome's stable version, asked of Google's release dashboard once a day: the ten-minute job's step. Never worked
    out from the visits: on 21 Oct 2026 a scraper on Chrome 142 to 145 outnumbered the site's people more than a
    hundred to one, so the version most visitors had was its own. A dashboard that does not answer is asked again at
    the next run, and the version kept before stands meanwhile. It answers the version it kept, "unanswered", or null
    when today's is kept already. */
export async function makeVisitLead(
  env: Pick<Env, "CACHE">,
  now = Date.now()
): Promise<number | "unanswered" | null> {
  const store = env.CACHE;
  if (!store) return null;
  const today = dayOf(now);
  const kept = await store.get<{ day?: unknown }>(leadName, "json");
  if (kept?.day === today) return null;
  const releases = (await fetch(STABLE, { signal: AbortSignal.timeout(ASK_MS) })
    .then(answer => (answer.ok ? answer.json() : null))
    .catch(() => null)) as { milestone?: unknown }[] | null;
  const lead = Number(Array.isArray(releases) ? releases[0]?.milestone : Number.NaN);
  if (!Number.isSafeInteger(lead) || lead < 100 || lead > 999) return "unanswered";
  await store.put(leadName, JSON.stringify({ day: today, lead }));
  return lead;
}
