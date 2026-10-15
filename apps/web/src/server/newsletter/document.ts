import { env } from "cloudflare:workers";
import type { Locale } from "@grabient/i18n";
import { getRequestEvent } from "@solidjs/web";
import type { IssuesPage } from "../../features/newsletter/input.ts";
import { publicOrigin } from "../seo/site.ts";
import { drawnLast, publishedIssues } from "./page.ts";

/* The newest issues as the server renders /newsletter. The document carries each issue's sheet once, as a shadow tree
   of its own (IssueSheet), so the page of issues the render hands to the browser leaves the sheets out: the browser
   keeps the tree it was given, the one the route's loader drew a moment before. */

const origin = () => publicOrigin(env, getRequestEvent()?.request);

/** A page of published issues without their sheets. */
export async function issuesForDocument(
  locale: Locale,
  before: number | null
): Promise<IssuesPage> {
  const page = await publishedIssues(env, origin(), locale, before);
  return { issues: page.issues.map(({ html: _, ...issue }) => issue), next: page.next };
}

/** A published issue's sheet, for the document's shadow tree. */
export const sheetForDocument = (locale: Locale, number: number): string | undefined =>
  drawnLast(origin(), locale, number);
