/* How often the files a link copies are fetched, and who asks: a page of this site, another site, or no page at all (an
   app, a script, a typed address), a crawler or a reader. Counted for each GET of a palette's or a collection's file
   before any cache answers it, so the edge's hits count too. Nothing counted names the asker. */

import type { Env } from "@grabient/server/env.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import { isCrawler } from "../crawlers.ts";
import { FILE_PATH } from "./keys.ts";

function sameHost(referer: string, url: string): boolean {
  try {
    return new URL(referer).host === new URL(url).host;
  } catch {
    return false;
  }
}

export function countFile(env: Pick<Env, "USAGE">, request: Request, path: string): void {
  const format = request.method === "GET" ? FILE_PATH.exec(path)?.[2] : undefined;
  if (!format) return;
  const site = request.headers.get("Sec-Fetch-Site");
  const referer = request.headers.get("Referer");
  const inside = site ? site === "same-origin" : !!referer && sameHost(referer, request.url);
  const asker = inside ? "site" : referer || (site && site !== "none") ? "other" : "none";
  countUsage(env, "file", format, asker, isCrawler(request) ? "crawler" : "reader");
}
