import { all } from "@grabient/server/db/d1.ts";
import { queueLabel } from "../../admin/queue.ts";
import { logContribution } from "../../admin/reviews.ts";
import {
  collectionUse,
  editSummary,
  searchAnswers,
  stemOf,
  useTotals,
  viewsTaken
} from "../../admin/signals.ts";
import { analyticsRows, readUsage } from "../../admin/usage.ts";
import {
  type Counted,
  forgetPopular,
  isCollectionSlug,
  leadRow,
  listScheduled,
  loadVocabulary,
  normalizeListQuery,
  popularLists,
  rankSearches,
  removeScheduled,
  risingSearches,
  SCHEDULE_AHEAD_DAYS,
  SCHEDULE_DEFAULT_DAYS,
  SCHEDULE_MAX,
  SCHEDULE_SPAN_DAYS,
  scheduleSearches,
  searchRecord,
  signalSite,
  slugify,
  tally,
  useRecord
} from "../../site.ts";
import {
  answer,
  entryOf,
  items,
  list,
  moment,
  num,
  READS,
  refuse,
  shape,
  str,
  type Tool,
  type ToolContext,
  text,
  whole
} from "../../tool.ts";
import { CHANGES_SITE, carried, who } from "./common.ts";

/* What readers do, counted with no address, account or cookie: what they search for, find, take and pass over, the
   tags they are shown, who signs up, and the site's own work. It says what is useful and what is missing, never what
   is good: it ranks below the admins' likes and record. */

const DAY = 86_400_000;
/** The last four weeks' search counts, the collections page left out: what the demand and the tags weigh. */
const recentCounts = (c: ToolContext, today: number) =>
  all<Counted>(
    c.env.DB,
    "SELECT day, page, words, count FROM k_search_counts WHERE day > ? AND page != 'collections'",
    today - 28
  );

export const readerTools: readonly Tool[] = [
  {
    name: "search_demand",
    title: "What people search for",
    hints: READS,
    description:
      "The searches people make most, most searched first: a year of grabient.com's searches with the last four weeks on this site added, connected apps' searches among them. `unread` is the last four weeks' searches in words the site can't read, that 3 searches or more made.",
    inputSchema: shape({ limit: whole("How many, default 100.", 1, 300) }),
    async run(args, c) {
      const vocabulary = await loadVocabulary(c.env);
      if (!vocabulary) return refuse("The search vocabulary is not available here.");
      const today = Math.floor(Date.now() / DAY);
      const limit = num(args.limit, 100, 1, 300);
      const [counts, record] = await Promise.all([
        recentCounts(c, today),
        searchRecord(c.env, { days: 28 })
      ]);
      return answer({
        searches: rankSearches(vocabulary, tally(counts, today))
          .slice(0, limit)
          .map(entry => entry.words),
        unread: record.unread
          .filter(row => row.page !== "collections")
          .slice(0, limit)
          .map(row => row.words)
      });
    }
  },
  {
    name: "search_tags",
    title: "The tags under the search",
    // a search scheduled again for the same start takes the new end; `remove` deletes
    hints: CHANGES_SITE,
    description: `The searches every reader sees as tags under the search field, in the order they stand: the ones scheduled here, then up to four searches rising this week, then the most searched, and none says again what one before it says. With no \`add\` or \`remove\` it only reads: the row as it stands now, what is scheduled and what is rising, with its counts. \`add\` schedules searches to lead the row from a day to a day, in the order sent, up to ${SCHEDULE_AHEAD_DAYS} days ahead. \`remove\` takes scheduled ones out by id or by their batch's label. A tag is a search the site answers from its own vocabulary, so every tag finds palettes: other words are refused, with the nearest searches that would stand.`,
    inputSchema: shape({
      add: list(
        shape(
          {
            words: text("The search, as a reader would type it.", { maxLength: 100 }),
            from: text("The day it starts (2026-10-20) or a moment (ISO 8601). Left out, now."),
            until: text(
              `The last day it stands. Left out, ${SCHEDULE_DEFAULT_DAYS} days from its start. At most ${SCHEDULE_SPAN_DAYS} days.`
            )
          },
          ["words"]
        ),
        "Searches to schedule.",
        1,
        SCHEDULE_MAX
      ),
      label: text("A name for this batch, to find or remove it.", { maxLength: 80 }),
      remove: shape({
        ids: list(text(""), "Scheduled searches by id.", 1, 200),
        label: text("A batch's label.", { maxLength: 80 })
      })
    }),
    async run(args, c) {
      const vocabulary = await loadVocabulary(c.env);
      if (!vocabulary) return refuse("The search vocabulary is not available here.");
      const label = queueLabel(args.label);
      const now = Date.now();
      let added = 0;
      let removed = 0;
      let refused: Awaited<ReturnType<typeof scheduleSearches>>["refused"] = [];
      if (args.remove !== undefined) {
        const by = entryOf(args.remove);
        const ids = items(by?.ids, 200).filter((id): id is string => typeof id === "string");
        const batch = queueLabel(by?.label);
        if (!ids.length && !batch) return refuse("Name what to remove by ids or by a label.");
        removed = await removeScheduled(c.env, { ids, label: batch || undefined });
      }
      if (args.add !== undefined) {
        const entries = items(args.add, SCHEDULE_MAX).map(raw =>
          typeof raw === "string" ? { words: raw } : (entryOf(raw) ?? {})
        );
        if (!entries.length) return refuse("Send at least one search to add.");
        const stopped = await carried(c, entries.length);
        if (stopped) return stopped;
        ({ scheduled: added, refused } = await scheduleSearches(
          c.env,
          c.grant.userId,
          entries,
          label,
          now
        ));
      }
      if (added || removed)
        await logContribution(c.env, who(c), "search_tags", label || "tags", { added, removed });
      // the row as readers will be given it, read again after any change
      forgetPopular(c.env);
      const today = Math.floor(now / DAY);
      const [lists, scheduled, counts] = await Promise.all([
        popularLists(c.env, now),
        listScheduled(c.env, now),
        recentCounts(c, today)
      ]);
      return answer({
        ...(args.add !== undefined ? { added } : {}),
        ...(args.remove !== undefined ? { removed } : {}),
        ...(refused.length ? { refused } : {}),
        now: leadRow(vocabulary, lists).slice(0, 24),
        scheduled: scheduled.map(s => ({
          id: s.id,
          words: s.words,
          from: moment(s.startsAt),
          until: moment(s.endsAt),
          ...(s.label ? { label: s.label } : {}),
          showing: s.startsAt <= now
        })),
        rising: risingSearches(counts, today).slice(0, 24)
      });
    }
  },
  {
    name: "palette_use",
    title: "How readers use the palettes",
    hints: READS,
    description:
      "What readers did with the public palettes in the last days, counted with no address, account or cookie: with a collection, its page's views, each of its palettes' opens and copies by place, and how readers changed its palettes in the editor before taking them; without, the palettes taken most, the collections seen most and the editor's changes. The raw counts: visitor_signals weighs them by place. Readers' use says what is useful, not what is good: the admins' likes and record stand above it.",
    inputSchema: shape({
      collection: text("A public collection's slug; left out, the whole site."),
      days: whole("The window in days, default 28.", 1, 90),
      limit: whole("How many, default 30.", 1, 200)
    }),
    async run(args, c) {
      const days = num(args.days, 28, 1, 90);
      const limit = num(args.limit, 30, 1, 200);
      const slug = str(args.collection, 120);
      if (slug && !isCollectionSlug(slug)) return refuse("That is not a collection slug.");
      const record = await useRecord(c.env, { days });
      type Tally = {
        opens: number;
        takes: number;
        formats: Record<string, number>;
        places: Record<string, number>;
      };
      const add = (into: Map<string, Tally>, key: string, row: (typeof record.uses)[number]) => {
        const t = into.get(key) ?? { opens: 0, takes: 0, formats: {}, places: {} };
        if (row.action === "open") t.opens += row.count;
        else {
          t.takes += row.count;
          t.formats[row.format] = (t.formats[row.format] ?? 0) + row.count;
        }
        if (row.position >= 0)
          t.places[row.position + 1] = (t.places[row.position + 1] ?? 0) + row.count;
        into.set(key, t);
      };
      const palettes = new Map<string, Tally>();
      if (slug) {
        for (const row of record.uses) if (row.collection === slug) add(palettes, row.seed, row);
        const views = record.collectionViews
          .filter(v => v.slug === slug)
          .reduce((n, v) => n + v.count, 0);
        return answer({
          collection: slug,
          url: `${c.origin}/${slug}`,
          days,
          views,
          palettes: [...palettes]
            .sort((a, b) => b[1].takes + b[1].opens - a[1].takes - a[1].opens)
            .slice(0, limit)
            .map(([seed, t]) => ({ seed, ...t })),
          edits: editSummary({ edits: record.edits.filter(e => e.collection === slug) }).all
        });
      }
      for (const row of record.uses) add(palettes, row.seed, row);
      const seen = new Map<string, number>();
      for (const v of record.collectionViews) seen.set(v.slug, (seen.get(v.slug) ?? 0) + v.count);
      return answer({
        days,
        truncated: record.truncated,
        palettes: [...palettes]
          .sort((a, b) => b[1].takes - a[1].takes || b[1].opens - a[1].opens)
          .slice(0, limit)
          .map(([seed, t]) => ({ seed, opens: t.opens, takes: t.takes, formats: t.formats })),
        collections: [...seen]
          .sort((a, b) => b[1] - a[1])
          .slice(0, limit)
          .map(([s, n]) => ({ slug: s, url: `${c.origin}/${s}`, views: n })),
        edits: editSummary(record).all
      });
    }
  },
  {
    name: "signups",
    title: "Who signs up, and from where",
    hints: READS,
    description:
      "Accounts made in the last weeks, week by week, and how each one's first visit reached Grabient: the campaign tags on the link, the site that sent it and the page it landed on. Those are saved only when the reader had analytics on, so an account without them came with analytics off or straight to the site. Counts alone: no account, name or email. The seeding personas are left out, and admins are counted apart.",
    inputSchema: shape({
      weeks: whole("How many weeks back, default 12.", 1, 104),
      limit: whole("How many of each kind of source, default 20.", 1, 100)
    }),
    async run(args, c) {
      const weeks = num(args.weeks, 12, 1, 104);
      const limit = num(args.limit, 20, 1, 100);
      const rows = await all<{
        at: number;
        role: string | null;
        source: string | null;
        medium: string | null;
        campaign: string | null;
        referrer: string | null;
        landing: string | null;
      }>(
        c.env.DB,
        `SELECT created_at AS at, role, attribution_source AS source, attribution_medium AS medium,
           attribution_campaign AS campaign, attribution_referrer AS referrer, attribution_landing AS landing
         FROM auth_user WHERE created_at >= ? AND id NOT IN (SELECT user_id FROM k_personas)`,
        Date.now() - weeks * 7 * DAY
      );
      // a week from its Monday, in UTC
      const weekOf = (at: number) => {
        const d = new Date(Number(at));
        return new Date(
          Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
        )
          .toISOString()
          .slice(0, 10);
      };
      const traced = (row: (typeof rows)[number]) =>
        Boolean(row.source || row.referrer || row.landing);
      const byWeek = new Map<string, { accounts: number; admins: number; traced: number }>();
      for (const row of rows) {
        const w = byWeek.get(weekOf(row.at)) ?? { accounts: 0, admins: 0, traced: 0 };
        if (row.role === "admin") w.admins++;
        else {
          w.accounts++;
          if (traced(row)) w.traced++;
        }
        byWeek.set(weekOf(row.at), w);
      }
      const readers = rows.filter(row => row.role !== "admin");
      const top = (pick: (row: (typeof readers)[number]) => string | null) => {
        const counts = new Map<string, number>();
        for (const row of readers) {
          const key = pick(row) || "(none)";
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return [...counts]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, limit)
          .map(([value, accounts]) => ({ value, accounts }));
      };
      return answer({
        weeks,
        accounts: readers.length,
        admins: rows.length - readers.length,
        traced: readers.filter(traced).length,
        byWeek: [...byWeek]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([week, w]) => ({ week, ...w })),
        sources: top(row => row.source),
        mediums: top(row => row.medium),
        campaigns: top(row => row.campaign),
        referrers: top(row => row.referrer),
        landings: top(row => row.landing)
      });
    }
  },
  {
    name: "visitor_signals",
    title: "What readers use and pass over",
    hints: READS,
    description:
      "What readers' use says about the collections, weighed by each palette's place on its page (a palette near the top is used more for being there): with a collection, each of its palettes' uses against what its place would earn (lift above 1 is more), the ones readers pass over and the ones they take, the styles they switch to and how they change its palettes in the editor; without, the collections seen most and taken least, every collection's passed-over and taken palettes, the searches answered badly or by no collection, and the site's style and editor changes. A collection needs `minUses` uses on its page to be judged. Counted with no address, account or cookie. It ranks below the admins' notes, record and likes in choosing what to make, extend or replace: it never earns a like, and a palette a person liked stays.",
    inputSchema: shape({
      collection: text("A public collection's slug; left out, the whole site."),
      days: whole("The window in days, default 28.", 1, 90),
      minUses: whole("Uses on a collection's own page before it is judged, default 10.", 1, 1000),
      limit: whole("How many of each list, default 20.", 1, 100)
    }),
    async run(args, c) {
      const days = num(args.days, 28, 1, 90);
      const minUses = num(args.minUses, 10, 1, 1000);
      const limit = num(args.limit, 20, 1, 100);
      const slug = str(args.collection, 120);
      if (slug && !isCollectionSlug(slug)) return refuse("That is not a collection slug.");
      const [record, searches] = await Promise.all([
        useRecord(c.env, { days }),
        slug ? null : searchRecord(c.env, { days })
      ]);
      const site = await signalSite(
        c.env,
        record.uses.map(u => u.seed)
      );
      const { weights, collections } = collectionUse(record, site, { minUses });
      const views = viewsTaken(record, site);
      const edits = editSummary(record);
      const counted = record.uses.length + record.collectionViews.length > 0;
      if (slug) {
        const one = collections.find(x => x.slug === slug);
        if (!one) return refuse("No public collection has that slug.");
        return answer({
          ...one,
          url: `${c.origin}/${slug}`,
          days,
          minUses,
          counted,
          placeWeights: weights.slice(0, one.items),
          viewsTaken: views.collections.find(x => x.slug === slug) ?? { takes: 0, styleChanged: 0 },
          edits: edits.collections.find(x => x.slug === slug) ?? null
        });
      }
      const judged = collections.filter(x => x.enough);
      const answers = searchAnswers(searches!, site, slugify);
      const stems = new Set(collections.map(x => stemOf(x.slug)));
      return answer({
        days,
        minUses,
        counted,
        totals: useTotals(record),
        collections: {
          judged: judged.length,
          of: collections.length,
          mostSeen: collections
            .slice(0, limit)
            .filter(x => x.views)
            .map(x => ({
              slug: x.slug,
              views: x.views,
              opens: x.opens,
              takes: x.takes,
              takeRate: x.takeRate,
              saves: x.saves
            })),
          seenLeastTaken: judged
            .filter(x => x.views >= 20 && x.takeRate !== null)
            .sort((a, b) => (a.takeRate ?? 0) - (b.takeRate ?? 0))
            .slice(0, limit)
            .map(x => ({ slug: x.slug, views: x.views, takes: x.takes, takeRate: x.takeRate })),
          passedOver: judged
            .filter(x => x.passedOver.length)
            .slice(0, limit)
            .map(x => ({ slug: x.slug, seeds: x.passedOver })),
          taken: judged
            .filter(x => x.taken.length)
            .slice(0, limit)
            .map(x => ({ slug: x.slug, seeds: x.taken }))
        },
        placeWeights: weights.slice(0, 12),
        searches: {
          rate: answers.rate,
          weak: answers.searches.filter(x => x.weak).slice(0, limit),
          uncovered: (searches?.ranked ?? [])
            .filter(x => /\p{L}/u.test(x.words) && !stems.has(stemOf(slugify(x.words))))
            .slice(0, limit)
            .map(x => ({ words: x.words, rank: x.rank }))
        },
        viewsTaken: {
          takes: views.takes,
          styleChanged: views.styleChanged,
          stepsUp: views.stepsUp,
          stepsDown: views.stepsDown,
          changes: views.changes.slice(0, 8)
        },
        edits: { all: edits.all, collections: edits.collections.slice(0, limit) }
      });
    }
  },
  {
    name: "search_use",
    title: "How well searches are answered",
    hints: READS,
    description:
      "The searches readers made with Enter in the last days, in the words the site knows, with how many went on to open, copy or download a palette from the results: each search's count, uses and rate against the site's own, whether it is answered badly (5 searches or more, used at under half the site's rate) and whether a public collection has its words as its title. `unread` is the words the site can't read that 3 searches or more made, by page (mcp is connected apps' searches); `votes` is the thumbs signed-in readers gave the palettes a search showed. With `words`, the searches that hold them. Counted with no address, account or cookie. search_demand ranks what people search for; this says whether they found it.",
    inputSchema: shape({
      words: text("Words a search holds; left out, every search."),
      days: whole("The window in days, default 28.", 1, 90),
      limit: whole("How many, default 50.", 1, 300)
    }),
    async run(args, c) {
      const days = num(args.days, 28, 1, 90);
      const limit = num(args.limit, 50, 1, 300);
      const words = normalizeListQuery(str(args.words, 60));
      const searches = await searchRecord(c.env, { days });
      const answers = searchAnswers(searches, await signalSite(c.env, []), slugify);
      const holds = (x: { words: string }) => !words || x.words.includes(words);
      const kept = answers.searches.filter(holds);
      const pages = new Map<string, { count: number; used: number }>();
      for (const row of searches.counted) {
        const p = pages.get(row.page) ?? { count: 0, used: 0 };
        p.count += row.count;
        p.used += row.used;
        pages.set(row.page, p);
      }
      return answer({
        days,
        rate: answers.rate,
        pages: Object.fromEntries(pages),
        searches: kept.slice(0, limit),
        weak: kept.filter(x => x.weak).length,
        unread: searches.unread.filter(holds).slice(0, limit),
        votes: searches.votes.filter(holds).slice(0, limit)
      });
    }
  },
  {
    name: "site_usage",
    title: "What the site's own work came to",
    hints: READS,
    description:
      "The counts of the site's own work in the last days, from Workers Analytics Engine: MCP tool calls by server, tool, outcome, address and app, and the requests without a valid token; apps signing in, by step and outcome, with the authorization server's errors; requests a limit refused, by limit, with the site-wide ceilings that ran out; old grabient.com addresses by how they resolved; pictures drawn, served from the cache or refused; errors pages reported, by kind of page and browser; and palette files fetched, by format and by who asked (this site, another site, or no page). Each day's totals too. This deploy's own counts. Nothing in them names a person.",
    inputSchema: shape({
      days: whole("The window in days, default 7.", 1, 90),
      limit: whole("How many rows of each event, default 25.", 1, 200)
    }),
    async run(args, c) {
      const days = num(args.days, 7, 1, 90);
      const limit = num(args.limit, 25, 1, 200);
      let report: Awaited<ReturnType<typeof readUsage>>;
      try {
        const read = await analyticsRows(c.env);
        if (typeof read === "string") return refuse(read);
        report = read.written
          ? await readUsage(read.sql, read.dataset, days)
          : await readUsage(async () => [], read.dataset, days);
      } catch (error) {
        const why = error instanceof Error ? error.message.slice(0, 200) : "unknown error";
        return refuse(`Analytics Engine could not be read: ${why}`);
      }
      return answer({
        ...report,
        events: Object.fromEntries(
          Object.entries(report.events).map(([event, rows]) => [event, rows.slice(0, limit)])
        ),
        ...(report.empty
          ? {
              note: "Nothing counted yet: the dataset appears with its first write, after a deploy with the USAGE binding."
            }
          : {})
      });
    }
  }
];
