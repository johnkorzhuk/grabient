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

/** An admin's ask of an issue's sheet: a palette it offers to lead with and a tip it offers to end with, each the one
    chosen where it is left out. Posted, it chooses its route's part. */
export const SheetChoice = v.object({
  issue: v.pipe(v.number(), v.integer(), v.minValue(1)),
  seed: v.optional(v.pipe(v.string(), v.maxLength(64))),
  tip: v.optional(v.pipe(v.string(), v.maxLength(64)))
});

/** An issue's sheet as drawn for an admin, with what one part of it offers (the palettes it may lead with, or its quick
    tips), each by its id and name, the one chosen, and the one shown. */
export const ChoiceSheet = v.object({
  options: v.array(v.object({ id: v.string(), name: v.string() })),
  chosen: v.nullable(v.string()),
  shown: v.string(),
  html: v.string()
});
export type ChoiceSheet = v.InferOutput<typeof ChoiceSheet>;

/** An account's choice, as Settings reads and writes it. */
export const Choice = v.object({ subscribed: v.boolean() });

/** The unsubscribe page's press: `true` subscribes again, and anything else ends the newsletter. */
export const Press = v.object({ subscribed: v.optional(v.boolean()) });

/** The groups a send reaches: the admins alone, as a rehearsal; the accounts that liked a palette; everyone the
    issue has not reached yet. */
export const SEGMENTS = ["admins", "likers", "everyone"] as const;
export type Segment = (typeof SEGMENTS)[number];
const SEND_STATES = ["prepared", "armed", "sending", "paused", "done", "cancelled"] as const;
export type SendState = (typeof SEND_STATES)[number];
/** Why a send paused: an admin, or the send itself on too many failures, errors in a row, a refused key, a letter
    Resend saw otherwise, the day's ceiling, no sender, or an address this deploy may not reach. */
const PAUSE_REASONS = [
  "admin",
  "failures",
  "errors",
  "key",
  "changed",
  "daily",
  "sender",
  "reach"
] as const;
export type PauseReason = (typeof PAUSE_REASONS)[number];

/** An admin's step on a send: prepare one, arm it with the count it prepared and its start, pause, resume or cancel
    it, or send its proof to the admin alone. */
export const SendAction = v.object({
  action: v.picklist(["prepare", "arm", "pause", "resume", "cancel", "proof"]),
  id: v.optional(v.pipe(v.string(), v.maxLength(64))),
  issue: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  segment: v.optional(v.picklist(SEGMENTS)),
  count: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
  startsAt: v.optional(v.pipe(v.number(), v.integer()))
});
export type SendAction = v.InferOutput<typeof SendAction>;

const Count = v.pipe(v.number(), v.integer(), v.minValue(0));
/** Who a prepared send leaves out of its group, and why. */
const LeftOut = v.object({
  unsubscribed: Count,
  personas: Count,
  undeliverable: Count,
  already: Count
});
export type LeftOut = v.InferOutput<typeof LeftOut>;
/** What stops a send's letters going out. A link's status 0 is no answer at all. */
const Problem = v.variant("kind", [
  v.object({ kind: v.literal("link"), url: v.string(), status: v.number() }),
  v.object({ kind: v.literal("outside"), url: v.string() }),
  v.object({ kind: v.literal("size"), bytes: v.number() }),
  v.object({ kind: v.literal("unsubscribe") })
]);
export type Problem = v.InferOutput<typeof Problem>;
/** A send as an admin sees it, its outbox counted by state. */
const SendView = v.object({
  id: v.string(),
  issue: v.number(),
  title: v.string(),
  segment: v.picklist(SEGMENTS),
  state: v.picklist(SEND_STATES),
  recipients: Count,
  leftOut: LeftOut,
  checks: v.object({ links: Count, bytes: Count, locales: v.array(v.string()) }),
  startsAt: v.nullable(v.number()),
  reason: v.nullable(v.picklist(PAUSE_REASONS)),
  createdAt: v.number(),
  armedAt: v.nullable(v.number()),
  finishedAt: v.nullable(v.number()),
  counts: v.object({
    queued: Count,
    sending: Count,
    sent: Count,
    skipped: Count,
    failed: Count,
    unknown: Count
  })
});
export type SendView = v.InferOutput<typeof SendView>;
/** The latest sends, newest first; the issues that can be sent, newest first; whether the newsletter is on, whether
    this deploy reaches readers, and the server's time. `problems` is what kept a prepare from writing anything. */
export const SendsAnswer = v.object({
  sends: v.array(SendView),
  issues: v.array(v.object({ number: v.number(), title: v.string() })),
  on: v.boolean(),
  reaches: v.boolean(),
  now: v.number(),
  problems: v.optional(v.array(Problem))
});
export type SendsAnswer = v.InferOutput<typeof SendsAnswer>;
