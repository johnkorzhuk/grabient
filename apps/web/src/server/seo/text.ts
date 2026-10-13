import { TEXT } from "../../lib/cache.ts";

/** Text for crawlers and agents: kept an hour by a browser and a day at the edge, which serves it a day longer while
    it asks again. */
export const textResponse = (body: string, type: string, headers: Record<string, string> = {}) =>
  new Response(body, {
    headers: { ...TEXT, "Content-Type": `${type}; charset=utf-8`, ...headers }
  });
