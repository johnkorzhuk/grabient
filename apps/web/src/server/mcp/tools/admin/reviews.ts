import { collectionItem } from "../../../../features/collections/schema.ts";
import {
  listContributions,
  listReviews,
  markReviews,
  REVIEW_NOTE_MAX,
  REVIEW_RUN_MAX,
  type ReviewInput,
  reviewSubject,
  VERDICTS,
  type Verdict
} from "../../admin/reviews.ts";
import {
  answer,
  entryOf,
  items,
  list,
  moment,
  momentOf,
  num,
  READS,
  refuse,
  shape,
  str,
  type Tool,
  text,
  whole
} from "../../tool.ts";
import { CHANGES_RECORD, carried, PAGE, SEED } from "./common.ts";

/* What the admins' apps keep for themselves: their reviews, so work is not repeated, and the log of what they changed. */

const isVerdict = (value: unknown): value is Verdict =>
  (VERDICTS as readonly unknown[]).includes(value);

export const reviewTools: readonly Tool[] = [
  {
    // repeating a mark rewrites its time, which moves it up review_list and into later windows
    name: "review_mark",
    title: "Record reviews",
    hints: { ...CHANGES_RECORD, idempotent: false },
    description:
      "Record what a review found, so work is not repeated: a verdict on a palette itself (how it looks), or on its fit when `collection` or `search` is given. One review stands per palette and subject; a new one replaces it. Reviews change nothing on the site.",
    inputSchema: shape(
      {
        run: text("A name for this pass of reviewing.", { maxLength: REVIEW_RUN_MAX }),
        reviews: list(
          shape(
            {
              seed: SEED,
              verdict: text("", { enum: [...VERDICTS] }),
              note: text("Why, briefly.", { maxLength: REVIEW_NOTE_MAX }),
              collection: text("The collection whose fit is judged."),
              search: text("The search whose fit is judged.")
            },
            ["seed", "verdict"]
          ),
          "The reviews.",
          1,
          200
        )
      },
      ["reviews"]
    ),
    async run(args, c) {
      const reviews: ReviewInput[] = [];
      for (const [i, raw] of items(args.reviews, 200).entries()) {
        const entry = entryOf(raw);
        const seed = collectionItem({ seed: entry?.seed })?.seed;
        const subject = reviewSubject(entry);
        if (!entry || !seed || subject === null || !isVerdict(entry.verdict)) {
          return refuse(
            `Review ${i + 1}: a palette seed, a verdict of good, bad or unsure, and at most one of collection or search.`
          );
        }
        reviews.push({
          seed,
          subject,
          verdict: entry.verdict,
          note: str(entry.note, REVIEW_NOTE_MAX)
        });
      }
      if (!reviews.length) return refuse("Send at least one review.");
      const stopped = await carried(c, reviews.length);
      if (stopped) return stopped;
      return answer({
        recorded: await markReviews(c.env, c.grant.userId, str(args.run, REVIEW_RUN_MAX), reviews)
      });
    }
  },
  {
    name: "review_list",
    title: "Read reviews",
    hints: READS,
    description:
      "The reviews on record, newest first: of palettes themselves, or of fit when `collection` or `search` is given.",
    inputSchema: shape({
      collection: text("Reviews of fit in this collection."),
      search: text("Reviews of fit for this search."),
      verdict: text("", { enum: [...VERDICTS] }),
      run: text("Only this pass.", { maxLength: REVIEW_RUN_MAX }),
      since: text("Only reviews after this moment (ISO 8601)."),
      page: PAGE,
      limit: whole("How many a page, default 100.", 1, 500)
    }),
    async run(args, c) {
      const subject =
        args.collection !== undefined || args.search !== undefined
          ? reviewSubject(args)
          : undefined;
      if (subject === null) return refuse("That collection or search is not valid.");
      const page = num(args.page, 1, 1, 10000);
      const limit = num(args.limit, 100, 1, 500);
      const reviews = await listReviews(c.env, {
        subject,
        verdict: isVerdict(args.verdict) ? args.verdict : undefined,
        run: str(args.run, REVIEW_RUN_MAX) || undefined,
        since: momentOf(args.since),
        limit,
        offset: (page - 1) * limit
      });
      return answer({
        page,
        reviews: reviews.map(r => ({
          seed: r.seed,
          about: r.subject || "palette",
          verdict: r.verdict,
          ...(r.note ? { note: r.note } : {}),
          ...(r.run ? { run: r.run } : {}),
          by: r.by,
          at: moment(r.at)
        }))
      });
    }
  },
  {
    name: "contribution_log",
    title: "What connected apps changed",
    hints: READS,
    description:
      "Every change an admin's connected app made to the site, newest first: who, through which app, with which tool, to what.",
    inputSchema: shape({
      tool: text("Only this tool."),
      since: text("Only changes after this moment (ISO 8601)."),
      limit: whole("How many, default 100.", 1, 500)
    }),
    async run(args, c) {
      const changes = await listContributions(c.env, {
        tool: str(args.tool, 60) || undefined,
        since: momentOf(args.since),
        limit: num(args.limit, 100, 1, 500)
      });
      return answer({ changes: changes.map(change => ({ ...change, at: moment(change.at) })) });
    }
  }
];
