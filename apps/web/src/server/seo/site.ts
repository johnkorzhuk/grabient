import { PRODUCTION_ORIGIN } from "../../lib/page-meta.ts";
import type { Env } from "../env.ts";

/* Which deploy search engines may index, and the origin the addresses it hands out name. Production, at
   grabient.com, is indexed: its www name serves the same pages, which name grabient.com. Staging.grabient.com, every
   Preview, every workers.dev address and local development hold copies of the site's pages and refuse every crawler
   three ways: the robots meta tag (lib/page-meta.ts), robots.txt, and an X-Robots-Tag header on every answer. The
   header alone keeps a page out of an index while a cached body or robots.txt says otherwise. */

/** The origin canonicals, sitemaps, files and share links name: the deploy's public origin, else the request's (a
    Preview's, local development's). Outside a request a deploy without one names a local address no index takes. */
export const publicOrigin = (env: Pick<Env, "PUBLIC_ORIGIN">, request?: Request) =>
  new URL(env.PUBLIC_ORIGIN || request?.url || "http://localhost").origin;

/** Whether search engines may index this deploy's answers: production's, at grabient.com, alone. */
export const indexed = (env: Pick<Env, "DEPLOYMENT" | "PUBLIC_ORIGIN">) =>
  env.DEPLOYMENT === "production" &&
  !!env.PUBLIC_ORIGIN &&
  new URL(env.PUBLIC_ORIGIN).origin === PRODUCTION_ORIGIN;

/** The header on every answer of a deploy that is not indexed, set over any a file carries of its own. */
export const NOINDEX = { "X-Robots-Tag": "noindex, nofollow" } as const;
