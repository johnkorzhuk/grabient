import { TEXT } from "../../lib/cache.ts";

/** The headers of what agents read: open to every site's pages, and out of search results. Kept apart from
    agents.ts, whose texts load only with the routes that answer them. */
export const AGENT_DATA = {
  "Access-Control-Allow-Origin": "*",
  "X-Robots-Tag": "noindex"
} as const;

/** Text for crawlers and agents: kept an hour by a browser and a day at the edge, which serves it a day longer while
    it asks again. */
export const textResponse = (body: string, type: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    headers: { ...TEXT, "Content-Type": `${type}; charset=utf-8`, ...headers }
  });

/** The day a time falls on, as files write it: 2026-10-01. */
export function isoDay(time: number | string | null | undefined): string | undefined {
  const date = time == null ? null : new Date(time);
  return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
}
