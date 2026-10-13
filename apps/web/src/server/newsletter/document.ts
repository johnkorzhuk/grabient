import type { Locale } from "@grabient/i18n";
import type { IssuesPage } from "../../features/newsletter/input.ts";

/* Stands in for the newsletter's document reads (wip/email server/newsletter/document.ts): what the newsletter's
   queries copied here call of it. */

/** A page of published issues without their sheets. */
export function issuesForDocument(_locale: Locale, _before: number | null): IssuesPage {
  return { issues: [], next: null };
}
