import { type Issue, insetStyles, issuePage, type SheetColors } from "@grabient/email";
import { DEFAULT_LOCALE, type Locale, localizePath } from "@grabient/i18n";
import type { Env } from "@grabient/server/env.ts";
import type { PageIssue } from "../../features/newsletter/input.ts";
import { keep } from "../search/kept.ts";
import { ISSUES } from "./issues/index.ts";
import { asRun, type IssueFacts, NO_FACTS, readFacts } from "./lead.ts";
import { issueFoot } from "./list.ts";

/* The issues as /newsletter shows them: the published ones to everyone, a few at a time, newest first, and the drafts
   to an admin alone (routes.ts). Each is its email's own sheet (`issuePage`), styled by the page's own tokens so it
   follows the page's theme, as it runs: led by the palette an admin chose, its palettes named as their pages are
   (lead.ts). The public answers are made from published issues only. */

/** How many issues one page of them holds. */
export const ISSUES_PAGE = 2;

/** An issue with its sheet, and a page of them. */
export type DrawnIssue = Required<PageIssue>;
export interface DrawnPage {
  issues: DrawnIssue[];
  next: number | null;
}

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

/* An issue is the same for every reader of a language, so an isolate draws each once per origin, language, lead and
   names, and keeps the last drawing of each issue for the document's shadow tree (document.ts). */
const DRAWINGS_KEPT = 48;
const drawnBefore = new WeakMap<Issue, Map<string, DrawnIssue>>();
const lastDrawn = new Map<string, DrawnIssue>();
/** An issue's sheet for a page, led by `lead` where given, else by the admin's choice. */
export function drawn(
  issue: Issue,
  origin: string,
  locale: Locale,
  facts: IssueFacts = NO_FACTS,
  lead?: string
): DrawnIssue {
  const words = asRun(issue, origin, facts, lead);
  const key = [
    origin,
    locale,
    ...(words.picks ?? []).map(chosen => `${chosen.seed} ${chosen.name}`)
  ].join("\n");
  const held = drawnBefore.get(issue) ?? new Map<string, DrawnIssue>();
  drawnBefore.set(issue, held);
  let page = held.get(key);
  if (!page) {
    /* a page has no reader: its way out is the unsubscribe page with no address in it, which says where it ends */
    const foot = issueFoot({ locale, unsubscribe: origin + localizePath("/unsubscribe", locale) });
    page = keep(
      held,
      key,
      {
        number: issue.number,
        month: issue.month,
        title: words.title,
        html: STYLES + issuePage({ ...words, ...foot, origin }).html
      },
      DRAWINGS_KEPT
    );
  }
  if (lead === undefined) lastDrawn.set(`${origin} ${locale} ${issue.number}`, page);
  return page;
}
/** The sheet of the published issue a page of them drew last in this isolate, for the document's shadow tree. */
export const drawnLast = (origin: string, locale: Locale, number: number): string | undefined =>
  lastDrawn.get(`${origin} ${locale} ${number}`)?.html;

/** What the database says of the issues, read for each drawing: the pages that show them are kept at the edge, so few
    drawings are made. A read that fails draws the issues as written, each palette named by its colors. */
export const issueFacts = (env: Pick<Env, "DB">): Promise<IssueFacts> =>
  readFacts(env, ISSUES).catch((error: unknown) => {
    console.error("newsletter: the issues' facts were not read", String(error));
    return NO_FACTS;
  });
const newestFirst = (issues: readonly Issue[]) => [...issues].sort((a, b) => b.number - a.number);

/** A page of the published issues among these, newest first: those numbered below `before`, or the newest. */
export function publishedPage(
  issues: readonly Issue[],
  origin: string,
  locale: Locale = DEFAULT_LOCALE,
  before = Number.POSITIVE_INFINITY,
  facts: IssueFacts = NO_FACTS
): DrawnPage {
  const held = newestFirst(issues).filter(issue => issue.published && issue.number < before);
  return {
    issues: held.slice(0, ISSUES_PAGE).map(issue => drawn(issue, origin, locale, facts)),
    next: held.length > ISSUES_PAGE ? held[ISSUES_PAGE - 1].number : null
  };
}
/** The newsletter's own published issues: what the page and its API give everyone. */
export const publishedIssues = async (
  env: Pick<Env, "DB">,
  origin: string,
  locale?: Locale,
  before?: number | null
): Promise<DrawnPage> =>
  publishedPage(ISSUES, origin, locale, before ?? undefined, await issueFacts(env));

/* a month of an issue (2026-10) or of a time, counted from year 0, so two are as far apart as their difference */
const monthOf = (month: string) => {
  const [year, number] = month.split("-").map(Number);
  return year * 12 + number - 1;
};

/** The issue an admin's test sends: this month's, else the one whose month is nearest, the coming one where two are as
    near. The test is of the issue readers have in their hands now. */
export function testIssue(issues: readonly Issue[], now = Date.now()): Issue {
  const today = new Date(now);
  const current = today.getUTCFullYear() * 12 + today.getUTCMonth();
  const away = (issue: Issue) => Math.abs(monthOf(issue.month) - current);
  return [...issues].sort((a, b) => away(a) - away(b) || monthOf(b.month) - monthOf(a.month))[0];
}

/** Every issue among these with no day yet, newest first: an admin's to read. */
export const draftsAmong = (
  issues: readonly Issue[],
  origin: string,
  locale: Locale = DEFAULT_LOCALE,
  facts: IssueFacts = NO_FACTS
) =>
  newestFirst(issues)
    .filter(issue => !issue.published)
    .map(issue => drawn(issue, origin, locale, facts));
