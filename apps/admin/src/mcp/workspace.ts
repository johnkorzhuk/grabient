// The write surface: events, campaigns, goals, reports. Writes are confined
// to ADMIN_DB and are additive or soft-delete only; nothing here writes to
// grabient-prod, and no tool hard-deletes.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { campaignReport, getCampaign, listCampaigns, upsertCampaign } from "../campaigns";
import { listEvents, logEvent, softDeleteEvent } from "../events";
import { checkinGoal, listGoals, upsertGoal } from "../goals";
import { getReport, listReports, toMeta, writeReport } from "../reports";
import { json, notConfigured, toolError } from "./helpers";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function registerWorkspace(server: McpServer, env: Env, actor: string) {
  const db = () => env.ADMIN_DB;

  server.registerTool(
    "events",
    {
      description:
        "Record and read the markers that explain why a line moved: deploys, " +
        "decisions ('changed robots.txt'), external events (a Google algorithm " +
        "update — the kind most often MISSING when a chart is misread as our own " +
        "doing), incidents. Write one at the time it happens; an event added " +
        "three weeks later is a guess about a date. Point events take occurred_on; " +
        "ranges add ends_on (inclusive) and render as shaded bands. DO NOT log an " +
        "ad with kind anything — use the campaigns tool, which carries the utm " +
        "tag that makes it measurable. Writes are IDEMPOTENT: same kind+date+" +
        "label updates rather than duplicates (a retried call is safe); pass " +
        "allow_duplicate:true for a genuine same-day twin. The dedupe key is " +
        "source+kind+date+the first 40 characters of the label, so two long " +
        "labels sharing a prefix collide, and the same event logged by a human " +
        "and by an agent produces two rows (different source). Re-logging " +
        "updates the label, detail and ends_on but NOT the date — correct a " +
        "date by deleting and re-logging. delete soft-deletes; nothing is ever " +
        "hard-deleted. Events assert something HAPPENED, never that it caused " +
        "anything — correlation is your inference.",
      inputSchema: z.object({
        action: z.enum(["log", "list", "delete"]).optional(),
        kind: z.enum(["deploy", "decision", "external", "incident"]).optional(),
        label: z.string().min(1).max(80).optional(),
        occurred_on: isoDate.optional(),
        ends_on: isoDate.optional(),
        detail: z.string().max(1000).optional(),
        campaign_id: z.string().optional(),
        goal_slug: z.string().optional(),
        external_id: z.string().max(120).optional(),
        chart_visible: z.boolean().optional(),
        allow_duplicate: z.boolean().optional(),
        id: z.string().optional(),
        from: isoDate.optional(),
        to: isoDate.optional(),
        kinds: z.array(z.string()).optional(),
        include_hidden: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) => {
      const adminDb = db();
      if (!adminDb) return notConfigured("The event store", "ADMIN_DB binding + migrations");
      const now = new Date();
      switch (args.action ?? "list") {
        case "log": {
          if (!args.kind || !args.label) return toolError("action:'log' needs kind and label.");
          const result = await logEvent(
            adminDb,
            actor,
            {
              kind: args.kind,
              label: args.label,
              occurredOn: args.occurred_on,
              endsOn: args.ends_on,
              detail: args.detail,
              campaignId: args.campaign_id,
              goalSlug: args.goal_slug,
              externalId: args.external_id,
              chartVisible: args.chart_visible,
              allowDuplicate: args.allow_duplicate,
            },
            now,
          );
          return json({
            ...result,
            notes: [
              `Now visible on every chart whose range covers ${result.occurred_on}.`,
              result.deduped
                ? "An existing event with the same kind, date and label was UPDATED — pass allow_duplicate:true if you meant a second one."
                : "Recorded.",
            ],
          });
        }
        case "list": {
          const events = await listEvents(
            adminDb,
            {
              from: args.from,
              to: args.to,
              kinds: args.kinds,
              campaignId: args.campaign_id,
              includeHidden: args.include_hidden,
              limit: args.limit,
            },
            now,
          );
          return json({
            events: events.map((e) => ({
              id: e.id,
              kind: e.kind,
              on: e.occurred_on,
              ends_on: e.ends_on,
              label: e.label,
              detail: e.detail,
              source: e.source,
              campaign_id: e.campaign_id,
            })),
            note: "Range events are returned when their span OVERLAPS the window — one that started earlier and is still running is included.",
          });
        }
        case "delete": {
          if (!args.id) return toolError("action:'delete' needs an id.");
          const deleted = await softDeleteEvent(adminDb, args.id, now);
          return json({ deleted: deleted ? args.id : null, note: deleted ? "Soft-deleted; the dedupe key is freed." : "No live event with that id." });
        }
      }
    },
  );

  server.registerTool(
    "campaigns",
    {
      description:
        "Create, update and close campaigns — anything done to get traffic with " +
        "a start, an end and a utm_campaign tag: a paid ad, a newsletter " +
        "placement, a Show HN. Keyed on `id` (a slug you will reuse in later " +
        "calls), so calling twice edits rather than duplicates. WRITE THE " +
        "HYPOTHESIS BEFORE IT RUNS: hypothesis and outcome are separate fields " +
        "so the conclusion cannot overwrite the prediction, and the database " +
        "REFUSES status:'evaluated' without an outcome. The utm_campaign tag is " +
        "the join key to GA4 and to signup attribution — forced lowercase " +
        "(a-z0-9_-) because the site stores the URL's tag verbatim and a capital " +
        "letter is a silent zero-row join; reusing a tag across two campaigns is " +
        "refused (ambiguity is forever). Creating a campaign does NOT tag " +
        "anything: put ?utm_campaign=<tag> on the URL you give the platform, and " +
        "run campaign_report a day after launch to confirm the tag is arriving. " +
        "budget_cents is the plan; spend_cents is the fact, typed in at close.",
      inputSchema: z.object({
        action: z.enum(["upsert", "list", "get"]).optional(),
        id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,47}$/).optional(),
        utm_campaign: z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/).optional(),
        platform: z.string().max(40).optional(),
        landing_url: z.string().url().optional(),
        starts_on: isoDate.optional(),
        ends_on: isoDate.optional(),
        status: z.enum(["planned", "running", "ended", "evaluated", "cancelled"]).optional(),
        budget_cents: z.number().int().min(0).optional(),
        spend_cents: z.number().int().min(0).optional(),
        currency: z.string().length(3).optional(),
        hypothesis: z.string().max(2000).optional(),
        outcome: z.string().max(2000).optional(),
        goal_slug: z.string().optional(),
        notes: z.string().max(2000).optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) => {
      const adminDb = db();
      if (!adminDb) return notConfigured("The campaign store", "ADMIN_DB binding + migrations");
      const now = new Date();
      switch (args.action ?? "list") {
        case "list":
          return json({ campaigns: await listCampaigns(adminDb) });
        case "get": {
          if (!args.id) return toolError("action:'get' needs an id.");
          const campaign = await getCampaign(adminDb, args.id);
          return campaign ? json(campaign) : toolError(`No campaign '${args.id}'.`);
        }
        case "upsert": {
          if (!args.id) return toolError("action:'upsert' needs an id (a slug like 'x-ads-aug-2026').");
          const result = await upsertCampaign(adminDb, actor, args as any, now);
          if (result.refused) return toolError(result.refused);
          return json({
            campaign: result.campaign,
            created: result.created,
            warnings: result.warnings,
            note: "Run campaign_report with this id — on a planned campaign it returns the minimum detectable effect, which is worth knowing BEFORE the money is spent.",
          });
        }
      }
    },
  );

  server.registerTool(
    "campaign_report",
    {
      description:
        "Everything known about one campaign: how many sessions and signups " +
        "carry its tag, and whether the site's numbers moved beyond what " +
        "ordinary variance explains. Run it on a PLANNED campaign too: with no " +
        "data yet it returns minimum_detectable_effect — the smallest change " +
        "this window could detect given the current baseline. On a site this " +
        "size that is often larger than the effect being bought (measured here: " +
        "a 7-day window needs roughly +37% signups to clear the floor), which " +
        "is worth knowing before spending rather than after. This is a " +
        "before/after comparison against matched weekdays, NOT an experiment — " +
        "it never says the campaign caused anything, and concurrent_events " +
        "lists the rival explanations. Read `unavailable` before quoting " +
        "numbers: GA4 sessions and D1 signups are different populations with " +
        "different bot filtering and consent behaviour, and their ratio is NOT " +
        "a conversion rate. tag_seen_in_ga4:false with names in " +
        "campaign_names_seen means the tag never arrived (typo or redirect), " +
        "not that the ad failed.",
      inputSchema: z.object({
        campaign_id: z.string(),
        metrics: z.array(z.string()).max(6).optional(),
        baseline_weeks: z.number().int().min(2).max(8).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ campaign_id, metrics, baseline_weeks }) => {
      const adminDb = db();
      if (!adminDb) return notConfigured("The campaign store", "ADMIN_DB binding + migrations");
      const campaign = await getCampaign(adminDb, campaign_id);
      if (!campaign) return toolError(`No campaign '${campaign_id}'. campaigns action:'list' shows what exists.`);
      const report = await campaignReport(env, campaign, new Date(), {
        metrics,
        baselineWeeks: baseline_weeks,
      });
      return json(report);
    },
  );

  server.registerTool(
    "goals",
    {
      description:
        "Long-term objectives as objects, so 'are we on track' is a query. A " +
        "goal is a metric key plus a baseline (value + the date it was " +
        "measured) plus a target (value + due date); `current` is pulled from " +
        "the persisted history via the goal's aggregate (sum-over-window for " +
        "flow metrics like gsc.clicks, last-value for levels like " +
        "index.indexed). progress_pct is measured against the BASELINE, not " +
        "zero — the SEO baselines were taken 2026-08-17 and a goal ignoring " +
        "them would claim progress the work did not produce. on_track is " +
        "straight-line arithmetic, not a forecast. current:null means the " +
        "metric has no history yet — 'not measurable', not zero. Set " +
        "status:'abandoned' rather than deleting: a dropped goal is evidence " +
        "about what was learned.",
      inputSchema: z.object({
        action: z.enum(["list", "upsert", "checkin"]).optional(),
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,47}$/).optional(),
        title: z.string().max(120).optional(),
        metric_key: z.string().optional(),
        direction: z.enum(["up", "down"]).optional(),
        aggregate: z.enum(["last", "sum", "avg"]).optional(),
        window_days: z.number().int().min(1).max(365).optional(),
        baseline_value: z.number().optional(),
        baseline_day: isoDate.optional(),
        target_value: z.number().optional(),
        target_day: isoDate.optional(),
        status: z.enum(["active", "met", "missed", "abandoned"]).optional(),
        value: z.number().optional(),
        notes: z.string().max(1000).optional(),
        include_inactive: z.boolean().optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    },
    async (args) => {
      const adminDb = db();
      if (!adminDb) return notConfigured("The goal store", "ADMIN_DB binding + migrations");
      const now = new Date();
      switch (args.action ?? "list") {
        case "list":
          return json({ goals: await listGoals(adminDb, now, args.include_inactive ?? false) });
        case "upsert": {
          if (!args.slug) return toolError("action:'upsert' needs a slug.");
          const result = await upsertGoal(adminDb, args as any, now);
          if (!result.ok) return toolError(result.error);
          const goals = await listGoals(adminDb, now, true);
          return json({ goal: goals.find((g) => g.slug === args.slug) ?? null });
        }
        case "checkin": {
          if (!args.slug) return toolError("action:'checkin' needs a slug.");
          const known = await listGoals(adminDb, now, true);
          if (!known.some((g) => g.slug === args.slug)) {
            // Otherwise the goal_checkin foreign key fires and the agent gets a
            // raw D1_ERROR instead of something it can act on.
            return toolError(
              `No goal '${args.slug}'. goals action:'list' shows what exists; action:'upsert' creates one.`,
            );
          }
          await checkinGoal(adminDb, args.slug, now, args.value, args.notes);
          const goals = await listGoals(adminDb, now, true);
          return json({ goal: goals.find((g) => g.slug === args.slug) ?? null });
        }
      }
    },
  );

  server.registerTool(
    "report_write",
    {
      description:
        "Persist a markdown report to the admin archive and get back a link the " +
        "owner can open. USE THIS instead of pasting a long analysis into chat — " +
        "it returns a URL, and you should give the owner that URL. Omit `slug` " +
        "to create; pass the slug you were given back to REVISE the same report " +
        "— the URL stays stable across revisions, which is the point (the owner " +
        "may already have it open); every write appends the previous version to " +
        "a revision log, so an overwrite is recoverable. The slug derives from " +
        "date + title and is IMMUTABLE — changing the title later does not move " +
        "the URL. Body cap 256 KB. Markdown renders with raw HTML disabled: " +
        "inline <tags> appear as literal text, so write markdown, not HTML.",
      inputSchema: z.object({
        title: z.string().min(3).max(200),
        markdown: z.string().min(1),
        slug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,80}$/).optional(),
        summary: z.string().max(280).optional(),
        tags: z.array(z.string().max(32)).max(8).optional(),
        period: z
          .object({
            type: z.enum(["day", "week", "month", "quarter"]),
            start: isoDate,
            end: isoDate,
          })
          .optional(),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ title, markdown, slug, summary, tags, period }) => {
      const adminDb = db();
      if (!adminDb) return notConfigured("The report store", "ADMIN_DB binding + migrations");
      const result = await writeReport(
        adminDb,
        { title, markdown, slug, summary, tags, period, author: "agent", authorRef: actor },
        new Date(),
      );
      if (!result.ok) return toolError(result.error);
      return {
        content: [
          {
            type: "text" as const,
            text:
              `${result.created ? "Created" : `Updated (revision ${result.revision})`}: ${result.url}\n` +
              `Raw markdown: ${result.raw_url}\n` +
              `Slug for future revisions: ${result.slug}\n\nGive the owner the first link.`,
          },
        ],
        structuredContent: {
          slug: result.slug,
          url: result.url,
          raw_url: result.raw_url,
          revision: result.revision,
          created: result.created,
          bytes: result.bytes,
        },
      };
    },
  );

  server.registerTool(
    "reports",
    {
      description:
        "Browse and read the report archive — agent-written analyses " +
        "(kind:'report') and cron-generated period digests (kind:'digest') " +
        "share it. action:'list' returns metadata ONLY (summaries, never " +
        "bodies — call action:'get' for the text; a 256 KB report is a lot of " +
        "context, so pass include_body:false when metadata is enough). Every " +
        "item carries its admin.grabient.com URL.",
      inputSchema: z.object({
        action: z.enum(["list", "get"]).optional(),
        slug: z.string().optional(),
        kind: z.enum(["report", "digest"]).optional(),
        q: z.string().max(80).optional(),
        revision: z.number().int().min(1).optional(),
        include_body: z.boolean().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().max(120).optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ action, slug, kind, q, revision, include_body, limit, cursor }) => {
      const adminDb = db();
      if (!adminDb) return notConfigured("The report store", "ADMIN_DB binding + migrations");
      if ((action ?? "list") === "get") {
        if (!slug) return toolError("action:'get' needs a slug (from action:'list').");
        const report = await getReport(adminDb, slug, revision);
        if (!report) return toolError(`No report with slug '${slug}'. reports action:'list' shows what exists.`);
        return json({
          ...toMeta(report.row),
          ...(include_body === false ? {} : { markdown: report.body }),
          ...(report.row.payload_json ? { payload: JSON.parse(report.row.payload_json) } : {}),
        });
      }
      const { items, nextCursor } = await listReports(adminDb, { kind, q, limit, cursor });
      return json({ items, nextCursor });
    },
  );
}
