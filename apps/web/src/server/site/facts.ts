import { env } from "cloudflare:workers";
import type { SiteFacts } from "../../app/site.ts";
import { githubStars } from "../seo/stars.ts";

/** What the server knows of the site itself, read before a page renders: kept counts only, never a call out. */
export async function readSite(): Promise<SiteFacts> {
  return { stars: await githubStars(env) };
}
