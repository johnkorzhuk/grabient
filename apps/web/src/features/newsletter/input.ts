import * as v from "valibot";

/* What the newsletter's pages and the Worker say to each other, checked on both sides. */

/** An issue as a page is given it: its email's own sheet, as markup. */
export const PageIssue = v.object({
  number: v.number(),
  /** the month it is for: 2026-10 */
  month: v.string(),
  title: v.string(),
  html: v.string()
});
export type PageIssue = v.InferOutput<typeof PageIssue>;

/** A page of the published issues, newest first. `next` is the `before` of the page that follows, or null at the end. */
export const IssuesPage = v.object({ issues: v.array(PageIssue), next: v.nullable(v.number()) });
export type IssuesPage = v.InferOutput<typeof IssuesPage>;

/** The drafts, an admin's alone. */
export const Drafts = v.object({ issues: v.array(PageIssue) });

/** An account's choice, as Settings reads and writes it. */
export const Choice = v.object({ subscribed: v.boolean() });

/** The unsubscribe page's press: `true` subscribes again, and anything else ends the newsletter. */
export const Press = v.object({ subscribed: v.optional(v.boolean()) });
