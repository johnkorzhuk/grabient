import { type Issue, insetStyles, issuePage, type SheetColors } from "@grabient/email";
import { DEFAULT_LOCALE, isLocale, type Locale, localizePath } from "@grabient/i18n";
import type { IssuesPage, PageIssue } from "../../features/newsletter/input.ts";
import { ISSUES } from "./issues/index.ts";
import { issueFoot } from "./list.ts";

/* The issues as /newsletter shows them: the published ones to everyone, a few at a time, newest first, and the drafts
   to an admin alone (routes.ts). Each is its email's own sheet (`issuePage`), styled by the page's own tokens so it
   follows the page's theme. The public answers are made from published issues only. */

/** How many issues one page of them holds. */
export const ISSUES_PAGE = 2;

/* The tokens an issue's sheet takes on the page: the ones the email's two schemes are made of. Custom properties reach
   into the issue's shadow tree. */
const SHEET_COLORS: SheetColors = {
  paper: "var(--color-paper-solid)",
  edge: "var(--color-edge)",
  shadow: "var(--color-shadow-frost)",
  ink: "var(--color-ink)",
  ink2: "var(--color-ink2)",
  ink3: "var(--color-ink3)",
  line: "var(--color-edge2)",
  fill: "var(--color-paper2)",
  onInk: "var(--color-on-ink)"
};
const STYLES = `<style>${insetStyles(SHEET_COLORS)}</style>`;

/* An issue is the same for every reader of a language, so an isolate draws each once per origin and language. */
const drawnBefore = new WeakMap<Issue, Map<string, PageIssue>>();
function drawn(issue: Issue, origin: string, locale: Locale): PageIssue {
  const key = `${origin} ${locale}`;
  const held = drawnBefore.get(issue) ?? new Map<string, PageIssue>();
  drawnBefore.set(issue, held);
  let page = held.get(key);
  if (!page) {
    const words = issue.write(origin);
    /* a page has no reader: its way out is the unsubscribe page with no address in it, which says where it ends */
    const foot = issueFoot({ locale, unsubscribe: origin + localizePath("/unsubscribe", locale) });
    page = {
      number: issue.number,
      month: issue.month,
      title: words.title,
      html: STYLES + issuePage({ ...words, ...foot, origin }).html
    };
    held.set(key, page);
  }
  return page;
}
const newestFirst = (issues: readonly Issue[]) => [...issues].sort((a, b) => b.number - a.number);

/** A page of the published issues among these, newest first: those numbered below `before`, or the newest. */
export function publishedPage(
  issues: readonly Issue[],
  origin: string,
  locale: Locale = DEFAULT_LOCALE,
  before = Number.POSITIVE_INFINITY
): IssuesPage {
  const held = newestFirst(issues).filter(issue => issue.published && issue.number < before);
  return {
    issues: held.slice(0, ISSUES_PAGE).map(issue => drawn(issue, origin, locale)),
    next: held.length > ISSUES_PAGE ? held[ISSUES_PAGE - 1].number : null
  };
}
/** The newsletter's own published issues: what the page and its API give everyone. */
export const publishedIssues = (
  origin: string,
  locale?: Locale,
  before?: number | null
): IssuesPage => publishedPage(ISSUES, origin, locale, before ?? undefined);

/** Every issue among these with no day yet, newest first: an admin's to read. */
export const draftsAmong = (
  issues: readonly Issue[],
  origin: string,
  locale: Locale = DEFAULT_LOCALE
) =>
  newestFirst(issues)
    .filter(issue => !issue.published)
    .map(issue => drawn(issue, origin, locale));

/** The `before` a request names, or null for the newest page. */
export function beforeOf(params: URLSearchParams): number | null {
  const asked = params.get("before") ?? "";
  return /^[1-9]\d{0,5}$/.test(asked) ? Number(asked) : null;
}
/** The language a request names, English for anything else. */
export function languageOf(params: URLSearchParams): Locale {
  const asked = params.get("lang");
  return isLocale(asked) ? asked : DEFAULT_LOCALE;
}
/** The query `/api/newsletter` is kept at the edge by: its `before` and a language other than English, as read. */
export function issuesQuery(params: URLSearchParams): URLSearchParams {
  const key = new URLSearchParams();
  const before = beforeOf(params);
  const locale = languageOf(params);
  if (before) key.set("before", String(before));
  if (locale !== DEFAULT_LOCALE) key.set("lang", locale);
  return key;
}
