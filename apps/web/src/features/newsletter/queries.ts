import type { Locale } from "@grabient/i18n";
import { infiniteQueryOptions, queryOptions } from "@tanstack/solid-query";
import { createIsomorphicFn } from "@tanstack/solid-start";
import { getJson } from "../../lib/query.ts";
import { issuesForDocument } from "../../server/newsletter/document.ts";
import { Choice, Drafts, IssuesPage } from "./input.ts";

/* The newsletter's reads. The server renders the newest issues straight from the issues it holds, the sheets into the
   document and the rest into the data; the browser asks the public API for the issues before them, and an admin's
   browser asks for the drafts. */

const query = (params: Record<string, string | number | null>) => {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params))
    if (value != null) search.set(name, String(value));
  return search.size ? `?${search}` : "";
};
/* an issue's own links lead to the reader's language */
const lang = (locale: Locale) => (locale === "en" ? null : locale);

const readIssues = createIsomorphicFn()
  .server((locale: Locale, before: number | null) => issuesForDocument(locale, before))
  .client((locale: Locale, before: number | null) =>
    getJson(`/api/newsletter${query({ before, lang: lang(locale) })}`, IssuesPage)
  );

/** The published issues, newest first, a page at a time. */
export const issuesQuery = (locale: Locale) =>
  infiniteQueryOptions({
    queryKey: ["newsletter", locale],
    queryFn: ({ pageParam }) => readIssues(locale, pageParam),
    initialPageParam: null as number | null,
    getNextPageParam: (page: IssuesPage) => page.next,
    staleTime: 5 * 60_000,
    reconcile: "number"
  });

/** The drafts, which the server gives an admin alone. */
export const readDrafts = async (locale: Locale) =>
  (await getJson(`/api/me/newsletter/drafts${query({ lang: lang(locale) })}`, Drafts)).issues;

/** Whether the signed-in account gets the newsletter: Settings' switch, read once per account. */
export const choiceQuery = () =>
  queryOptions({
    queryKey: ["newsletter", "choice"],
    queryFn: async () => (await getJson("/api/me/newsletter", Choice)).subscribed,
    staleTime: Number.POSITIVE_INFINITY
  });
