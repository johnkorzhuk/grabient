import type { Env } from "@grabient/server/env.ts";
import { DATASETS } from "../mcp/admin/usage.ts";
import { behind } from "./rules.ts";

/* The day's key a visitor's code is made with (visits.ts): 32 random bytes in KV under visit-key:<UTC day>, made a day
   ahead by the ten-minute job, so every data center holds a day's key before its first visit, and kept until ten
   minutes past its day's end, when KV deletes it. */

const DAY = 86_400_000;
/** How long KV keeps a day's key past the day's end, for requests that began just before it. */
const KEY_GRACE_S = 600;

export const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const keyName = (day: string) => `visit-key:${day}`;
/** The version Chrome's people led with over the last day, which the feed to Google Analytics weighs a browser
    against (ga4.ts): { day, lead }. */
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

/** The day's leading Chrome version, worked out once a day from the last day's visits a person's request made: the
    ten-minute job's step. It answers the version when it worked one out. */
export async function makeVisitLead(
  env: Pick<Env, "CACHE" | "ANALYTICS" | "DEPLOYMENT">,
  now = Date.now()
): Promise<number | null> {
  const store = env.CACHE;
  const dataset = DATASETS[env.DEPLOYMENT];
  if (!store || !env.ANALYTICS || !dataset) return null;
  const today = dayOf(now);
  const kept = await store.get<{ day?: unknown; lead?: unknown }>(leadName, "json");
  if (kept?.day === today) return null;
  const was = typeof kept?.lead === "number" ? kept.lead : null;
  const answer = (await env.ANALYTICS.query({
    query: `SELECT blob7 AS browser, COUNT(DISTINCT blob15) AS visitors FROM events.analyticsEngine.${dataset} WHERE timestamp >= NOW() - INTERVAL '1' DAY AND blob1 = 'visit' AND blob2 IN ('landing', 'load', 'framed') AND blob10 = '' AND blob15 != '' GROUP BY browser`
  }).catch(() => null)) as { data?: { browser?: unknown; visitors?: unknown }[] } | null;
  if (!answer) return null;
  const rows = (answer?.data ?? []).map(row => ({
    browser: String(row.browser ?? ""),
    visitors: Number(row.visitors) || 0
  }));
  // a day with too few visits to lead keeps the version before it, and is not asked again until the next
  const lead = behind(rows).leading.Chrome ?? was;
  await store.put(leadName, JSON.stringify({ day: today, lead }));
  return lead;
}
