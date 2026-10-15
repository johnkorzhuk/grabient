import * as v from "valibot";

/* What the newsletter's pages and the Worker say to each other, checked on both sides. */

/** The last part of an account's unsubscribe address: 32 random bytes as lowercase hex. */
export const UNSUBSCRIBE_TOKEN = /^[0-9a-f]{64}$/;

/** An issue as a page is given it: its email's own sheet, as markup. */
export const PageIssue = v.object({
  number: v.number(),
  /** the month it is for: 2026-10 */
  month: v.string(),
  title: v.string(),
  /** absent where the document already holds the sheet as a shadow tree */
  html: v.optional(v.string())
});
export type PageIssue = v.InferOutput<typeof PageIssue>;

/** A page of the published issues, newest first. `next` is the `before` of the page that follows, or null at the end. */
export const IssuesPage = v.object({ issues: v.array(PageIssue), next: v.nullable(v.number()) });
export type IssuesPage = v.InferOutput<typeof IssuesPage>;

/** The drafts, an admin's alone. */
export const Drafts = v.object({ issues: v.array(PageIssue) });

/** An admin's choice of an issue's lead: a palette the issue offers. Without a seed it asks for the one chosen. */
export const LeadChoice = v.object({
  issue: v.pipe(v.number(), v.integer(), v.minValue(1)),
  seed: v.optional(v.pipe(v.string(), v.maxLength(64)))
});

/** An issue's sheet with the lead it was drawn with, the palettes it offers to lead with, and the one chosen. */
export const LeadSheet = v.object({
  options: v.array(v.object({ seed: v.string(), name: v.string() })),
  chosen: v.nullable(v.string()),
  shown: v.string(),
  html: v.string()
});
export type LeadSheet = v.InferOutput<typeof LeadSheet>;

/** An account's choice, as Settings reads and writes it. */
export const Choice = v.object({ subscribed: v.boolean() });

/** The unsubscribe page's press: `true` subscribes again, and anything else ends the newsletter. */
export const Press = v.object({ subscribed: v.optional(v.boolean()) });
