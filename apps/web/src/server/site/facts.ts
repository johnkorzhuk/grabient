import { env } from "cloudflare:workers";
import { flagOff } from "@grabient/server/flags/flags.ts";
import type { SiteFacts } from "../../app/site.ts";
import { githubStars } from "../seo/stars.ts";

/** What the server knows of the site itself, read before a page renders: kept counts and flags only, never a call
    out. */
export async function readSite(): Promise<SiteFacts> {
  const [stars, hidden] = await Promise.all([githubStars(env), flagOff(env, "newsletter")]);
  return { stars, newsletter: !hidden };
}
