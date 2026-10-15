import type { Env } from "../env.ts";

/* Counts of the site's own work, for the people who run it, in Workers Analytics Engine. Each is one data point written
   without waiting, and none names a person: no address, account or cookie. A deploy without the USAGE binding (a
   Preview) counts nothing. The first blob is the event, the rest say what happened:
     mcp           server (account, admin), tool, outcome (ok, refused, failed), address, the app's name; or challenge
     oauth         step, what, outcome, client
     limit         the limit that refused, then site (a ceiling for the whole site) or client (an address or account)
     legacy        how an old palette address resolved, reader or crawler
     image         what was asked for, what answered (cache, drawn, refused, failed)
     client-error  the kind of page, the browser
     file          the format fetched, who asked (site, other, none), reader or crawler
     failure       an answer of 500 or more that no flag refused: its status, the kind of address (page, api/<name>,
                   mcp or file)
   Each point rides on a request that is already limited, so the counts need no limit of their own. */

export type UsageEvent =
  | "mcp"
  | "oauth"
  | "limit"
  | "legacy"
  | "image"
  | "client-error"
  | "file"
  | "failure";

const BLOB_MAX = 96;

export function countUsage(env: Pick<Env, "USAGE">, event: UsageEvent, ...labels: string[]): void {
  try {
    env.USAGE?.writeDataPoint({
      indexes: [event],
      blobs: [event, ...labels.map(label => label.slice(0, BLOB_MAX))],
      doubles: [1]
    });
  } catch {
    // Counting never fails a request.
  }
}
