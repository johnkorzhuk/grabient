// Campaigns: the objects that make "I bought an ad — did it work?" a query.
//
// A campaign carries the utm_campaign tag that joins three systems: GA4
// (sessionManualCampaignName / firstUserManualCampaignName), the first-touch
// attribution columns on auth_user in the PRODUCTION database (read-only
// binding — the join happens in JavaScript because D1 cannot join across
// databases), and the metric_daily series for the lift comparison. The report
// never says "worked": it says how far the numbers moved beyond variance, and
// lists every other recorded event in the window as the rival explanations.

import { isoDay } from "./range";
import { queryGa4 } from "./ga4";
import { listEvents } from "./events";
import { readSeries } from "./db";
import { LAG_BY_SOURCE, liftKind, metricDef } from "./metrics";
import { computeLift, eachDay, minimumDetectableEffect, shiftDays, type LiftResult } from "./lift";

export type CampaignStatus = "planned" | "running" | "ended" | "evaluated" | "cancelled";

export interface CampaignRow {
  id: string;
  utm_campaign: string;
  platform: string;
  landing_url: string | null;
  starts_on: string;
  ends_on: string;
  status: CampaignStatus;
  budget_cents: number | null;
  spend_cents: number | null;
  currency: string;
  hypothesis: string | null;
  outcome: string | null;
  outcome_at: number | null;
  goal_slug: string | null;
  notes: string | null;
  created_by: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface CampaignUpsertInput {
  id: string;
  utm_campaign?: string;
  platform?: string;
  landing_url?: string;
  starts_on?: string;
  ends_on?: string;
  status?: CampaignStatus;
  budget_cents?: number;
  spend_cents?: number;
  currency?: string;
  hypothesis?: string;
  outcome?: string;
  goal_slug?: string;
  notes?: string;
}

export async function getCampaign(db: D1Database, id: string): Promise<CampaignRow | null> {
  try {
    return await db
      .prepare(`SELECT * FROM campaign WHERE id = ?1 AND deleted_at IS NULL`)
      .bind(id)
      .first<CampaignRow>();
  } catch (err) {
    console.error("getCampaign failed (migration pending?)", err);
    return null;
  }
}

export async function listCampaigns(db: D1Database): Promise<CampaignRow[]> {
  try {
    const res = await db
      .prepare(`SELECT * FROM campaign WHERE deleted_at IS NULL ORDER BY starts_on DESC LIMIT 100`)
      .all<CampaignRow>();
    return res.results ?? [];
  } catch (err) {
    console.error("listCampaigns failed (migration pending?)", err);
    return [];
  }
}

/**
 * Create-or-update, keyed on the slug. Soft problems come back as warnings
 * rather than failures — one owner, no workflow engine — but the two schema
 * CHECKs (lowercase tag, evaluated-needs-outcome) are hard and surface as
 * refusals with the constraint named.
 */
export async function upsertCampaign(
  db: D1Database,
  actor: string,
  input: CampaignUpsertInput,
  now: Date,
): Promise<{ campaign: CampaignRow | null; created: boolean; warnings: string[]; refused?: string }> {
  const warnings: string[] = [];
  const existing = await getCampaign(db, input.id);
  if (!existing) {
    // getCampaign filters soft-deleted rows, so without this the "create"
    // branch runs, ON CONFLICT(id) fires on the deleted row, and the caller is
    // handed a campaign that appears in no listing because deleted_at is still
    // set.
    const deleted = await db
      .prepare(`SELECT id FROM campaign WHERE id = ?1 AND deleted_at IS NOT NULL`)
      .bind(input.id)
      .first<{ id: string }>();
    if (deleted) {
      return {
        campaign: null,
        created: false,
        warnings,
        refused: `Campaign '${input.id}' was deleted. Pick a new id rather than reusing this one — its events and reports still point at the old row.`,
      };
    }
  }
  const ts = now.getTime();

  if (!existing) {
    const missing = (["utm_campaign", "platform", "starts_on", "ends_on"] as const).filter(
      (k) => !input[k],
    );
    if (missing.length) {
      return {
        campaign: null,
        created: false,
        warnings,
        refused: `Creating a campaign requires ${missing.join(", ")}.`,
      };
    }
  }

  const status = input.status ?? existing?.status ?? "planned";
  const outcome = input.outcome ?? existing?.outcome ?? null;
  if (status === "evaluated" && !(outcome && outcome.trim())) {
    return {
      campaign: null,
      created: false,
      warnings,
      refused:
        "A campaign cannot be marked evaluated without an outcome — the schema enforces it. Write down what happened first.",
    };
  }

  // The landing-URL pre-flight: a 301 that drops the query string is the
  // single most common way a campaign silently measures nothing.
  const landing = input.landing_url ?? existing?.landing_url ?? null;
  if (input.landing_url) {
    try {
      const res = await fetch(input.landing_url, { redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        const target = res.headers.get("location") ?? "";
        if (!/utm_campaign=/i.test(target)) {
          warnings.push(
            `landing_url ${res.status}-redirects to ${target || "(unknown)"}, which has no utm_campaign parameter — the tag will not reach GA4 or the attribution cookie.`,
          );
        }
      }
    } catch {
      warnings.push("landing_url could not be fetched for the redirect pre-flight; verify the tag survives manually.");
    }
  }

  const endsOn = input.ends_on ?? existing?.ends_on ?? null;
  if (status === "ended" && endsOn && endsOn > isoDay(now)) {
    warnings.push(`ends_on ${endsOn} is in the future; status 'ended' is premature.`);
  }
  const spend = input.spend_cents ?? existing?.spend_cents ?? null;
  const budget = input.budget_cents ?? existing?.budget_cents ?? null;
  if ((status === "ended" || status === "evaluated") && budget !== null && spend === null) {
    warnings.push("budget_cents is set but spend_cents is empty — cost per signup cannot be computed.");
  }

  try {
    const row = await db
      .prepare(
        `INSERT INTO campaign (id, utm_campaign, platform, landing_url, starts_on, ends_on,
                               status, budget_cents, spend_cents, currency, hypothesis, outcome,
                               outcome_at, goal_slug, notes, created_by, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?17)
         ON CONFLICT(id) DO UPDATE SET
           utm_campaign = COALESCE(?2, campaign.utm_campaign),
           platform = COALESCE(?3, campaign.platform),
           landing_url = COALESCE(?4, campaign.landing_url),
           starts_on = COALESCE(?5, campaign.starts_on),
           ends_on = COALESCE(?6, campaign.ends_on),
           status = ?7,
           budget_cents = COALESCE(?8, campaign.budget_cents),
           spend_cents = COALESCE(?9, campaign.spend_cents),
           currency = COALESCE(?10, campaign.currency),
           hypothesis = COALESCE(?11, campaign.hypothesis),
           outcome = COALESCE(?12, campaign.outcome),
           outcome_at = COALESCE(?13, campaign.outcome_at),
           goal_slug = COALESCE(?14, campaign.goal_slug),
           notes = COALESCE(?15, campaign.notes),
           updated_at = ?17
         RETURNING *`,
      )
      .bind(
        input.id,
        // These three fall back to the stored row like every other column:
        // binding a bare null made the NOT NULL check fail on the candidate
        // row before ON CONFLICT was ever considered, so recording spend on an
        // existing campaign was impossible.
        input.utm_campaign ?? existing?.utm_campaign ?? null,
        input.platform ?? existing?.platform ?? null,
        landing,
        input.starts_on ?? existing?.starts_on ?? null,
        endsOn,
        status,
        budget,
        spend,
        input.currency ?? existing?.currency ?? "USD",
        input.hypothesis ?? null,
        outcome,
        status === "evaluated" && !existing?.outcome_at ? ts : (existing?.outcome_at ?? null),
        input.goal_slug ?? null,
        input.notes ?? null,
        actor,
        ts,
      )
      .first<CampaignRow>();
    return { campaign: row, created: !existing, warnings };
  } catch (err) {
    const message = String(err);
    // The CHECK constraints fire at runtime; translate the two likely ones.
    // Order matters: a UNIQUE violation also mentions utm_campaign, and
    // telling someone their tag is malformed when it is actually taken sends
    // them to fix the wrong thing.
    const refused = /UNIQUE constraint failed: campaign\.utm_campaign/.test(message)
      ? `The tag '${input.utm_campaign}' already belongs to another campaign. Tags must be unique — an ambiguous tag makes its attribution unresolvable forever. Run this one under a new tag.`
      : /CHECK constraint failed/.test(message) && /utm_campaign/.test(message)
        ? "utm_campaign was refused by the schema: lowercase a-z, 0-9, hyphen and underscore only, 2-64 chars. The site stores utm_campaign verbatim off the URL, so a capital letter is a silent zero-row join."
      : /outcome/.test(message)
        ? "The schema refused: status 'evaluated' requires a non-empty outcome."
        : `The database refused the write: ${message.slice(0, 200)}`;
    return { campaign: null, created: false, warnings, refused };
  }
}

// ---------------------------------------------------------------------------
// The report.
// ---------------------------------------------------------------------------

const DEFAULT_REPORT_METRICS = ["d1.signups", "ga4.sessions", "gsc.clicks"];

export interface CampaignReport {
  campaign: Pick<
    CampaignRow,
    | "id"
    | "utm_campaign"
    | "platform"
    | "starts_on"
    | "ends_on"
    | "status"
    | "budget_cents"
    | "spend_cents"
    | "hypothesis"
    | "outcome"
  >;
  windows: {
    during: { from: string; to: string; days: number; complete: boolean };
    pre: { from: string; to: string; days: number };
    post: { from: string; to: string; days: number } | null;
    post_reason?: string;
  };
  tagged: Record<string, unknown>;
  lift: LiftResult[];
  planned_mde?: Record<string, unknown>;
  cost: Record<string, unknown> | null;
  concurrent_events: Array<{ id: string; on: string; kind: string; label: string }>;
  caveats: string[];
  unavailable: string[];
}

export async function campaignReport(
  env: Env,
  campaign: CampaignRow,
  now: Date,
  options: { metrics?: string[]; baselineWeeks?: number } = {},
): Promise<CampaignReport> {
  const metrics = options.metrics?.length ? options.metrics : DEFAULT_REPORT_METRICS;
  const baselineWeeks = Math.max(2, Math.min(8, options.baselineWeeks ?? 4));
  const D = eachDay(campaign.starts_on, campaign.ends_on).length;
  const today = isoDay(now);

  const tag = campaign.utm_campaign;
  const window = { start: campaign.starts_on, end: campaign.ends_on };
  const sessionFilter = {
    filter: {
      fieldName: "sessionManualCampaignName",
      stringFilter: { matchType: "EXACT", value: tag, caseSensitive: false },
    },
  };

  // --- GA4: tagged sessions, first-touch counterpart, landing check, tag-seen sweep.
  let ga4Tagged: Record<string, unknown> = { tag_seen_in_ga4: null };
  try {
    const [tagged, firstTouch, landing, seen] = [
      await queryGa4(env, now, {
        metrics: ["sessions", "activeUsers", "newUsers"],
        start: window.start,
        end: window.end,
        filter: sessionFilter,
      }),
      await queryGa4(env, now, {
        metrics: ["sessions"],
        start: window.start,
        end: window.end,
        filter: {
          filter: {
            fieldName: "firstUserManualCampaignName",
            stringFilter: { matchType: "EXACT", value: tag, caseSensitive: false },
          },
        },
      }),
      await queryGa4(env, now, {
        dimensions: ["landingPagePlusQueryString"],
        metrics: ["sessions"],
        start: window.start,
        end: window.end,
        filter: sessionFilter,
        orderBy: [{ field: "sessions" }],
        limit: 10,
      }),
      await queryGa4(env, now, {
        dimensions: ["sessionManualCampaignName"],
        metrics: ["sessions"],
        start: window.start,
        end: window.end,
        orderBy: [{ field: "sessions" }],
        limit: 50,
      }),
    ];

    // keyEvents:sign_up separately — it 400s when sign_up is not marked as a
    // key event in GA4 admin, and that failure must not take the report down.
    let keyEvents: number | null = null;
    let keyEventsNote: string | undefined;
    try {
      const ke = await queryGa4(env, now, {
        metrics: ["keyEvents:sign_up"],
        start: window.start,
        end: window.end,
        filter: sessionFilter,
      });
      keyEvents = (ke?.totals?.["keyEvents:sign_up"] as number) ?? null;
    } catch {
      keyEventsNote =
        "keyEvents:sign_up was refused — sign_up is probably not marked as a key event in GA4 admin, so tagged conversions cannot be read from GA4 (D1 signups below still work).";
    }

    const sessions = (tagged?.totals?.sessions as number) ?? 0;
    const namesSeen = (seen?.rows ?? [])
      .map((r) => String(r.sessionManualCampaignName ?? ""))
      .filter((s) => s && s !== "(not set)");
    const tagSeen = sessions > 0;
    ga4Tagged = {
      tag_seen_in_ga4: tagSeen,
      ga4_sessions: sessions,
      ga4_active_users: (tagged?.totals?.activeUsers as number) ?? 0,
      ga4_new_users: (tagged?.totals?.newUsers as number) ?? 0,
      ga4_key_events_sign_up: keyEvents,
      ga4_first_user_sessions: (firstTouch?.totals?.sessions as number) ?? 0,
      landing_pages: (landing?.rows ?? []).map((r) => ({
        path: r.landingPagePlusQueryString,
        sessions: r.sessions,
      })),
      campaign_names_seen_in_window: namesSeen.slice(0, 12),
      ...(keyEventsNote ? { key_events_note: keyEventsNote } : {}),
      ...(!tagSeen && namesSeen.length
        ? {
            diagnostic: `The tag '${tag}' produced no GA4 rows in the window. Names that DID appear: ${namesSeen
              .slice(0, 5)
              .join(", ")} — check for a typo or a redirect stripping the query string.`,
          }
        : {}),
    };
  } catch (err) {
    ga4Tagged = { tag_seen_in_ga4: null, ga4_error: String(err).slice(0, 200) };
  }

  // --- D1 first-touch signups (production DB, read-only), both cohorts.
  const startMs = Date.parse(`${window.start}T00:00:00Z`);
  const endMs = Date.parse(`${window.end}T00:00:00Z`) + 86_400_000;
  let d1Tagged: Record<string, unknown> = {};
  try {
    const [landed, created] = await env.DB.batch<any>([
      env.DB.prepare(
        `SELECT COUNT(*) AS signups,
                SUM(CASE WHEN l.user_id IS NOT NULL THEN 1 ELSE 0 END) AS activated
           FROM auth_user u
           LEFT JOIN (SELECT DISTINCT user_id FROM likes) l ON l.user_id = u.id
          WHERE LOWER(u.attribution_campaign) = LOWER(?1)
            AND u.attribution_at >= ?2 AND u.attribution_at < ?3`,
      ).bind(tag, startMs, endMs),
      env.DB.prepare(
        `SELECT COUNT(*) AS signups FROM auth_user
          WHERE LOWER(attribution_campaign) = LOWER(?1)
            AND created_at >= ?2 AND created_at < ?3`,
      ).bind(tag, startMs, endMs),
    ]);
    const landedRow = landed.results?.[0] ?? { signups: 0, activated: 0 };
    d1Tagged = {
      tag_seen_in_d1: (landedRow.signups ?? 0) > 0,
      d1_landed_in_window_signups: landedRow.signups ?? 0,
      d1_activated: landedRow.activated ?? 0,
      d1_created_in_window_signups: created.results?.[0]?.signups ?? 0,
      as_of: now.toISOString(),
      note: "landed_in_window counts people whose FIRST VISIT fell in the window (attribution_at is the landing time) — the cohort the campaign brought, still maturing: a landing during the campaign that signs up next month joins this number later.",
    };
  } catch (err) {
    d1Tagged = { tag_seen_in_d1: null, d1_error: String(err).slice(0, 200) };
  }

  // --- Lift per metric, from the persisted daily series.
  const lift: LiftResult[] = [];
  const adminDb = env.ADMIN_DB;
  for (const key of metrics) {
    const def = metricDef(key);
    const kind = liftKind(key);
    const lag = def ? LAG_BY_SOURCE[def.source] : 1;
    const windowComplete = campaign.ends_on <= shiftDays(today, -lag);
    if (!adminDb) {
      lift.push({
        metric: key,
        verdict: "insufficient-data",
        observed: null,
        expected: null,
        lift: null,
        pct: null,
        withinNoise: null,
        sigmas: null,
        noiseFloor: null,
        baselineWeeksRequested: baselineWeeks,
        baselineWeeksUsed: 0,
        minimumDetectableEffect: null,
        note: "The metric store is not configured.",
      });
      continue;
    }
    const since = shiftDays(campaign.starts_on, -7 * baselineWeeks);
    const points = await readSeries(adminDb, key, since, campaign.ends_on);
    const series = new Map(points.map((p) => [p.day, p.value]));
    lift.push(
      computeLift({
        metric: key,
        metricKind: kind,
        series,
        startsOn: campaign.starts_on,
        endsOn: campaign.ends_on,
        baselineWeeks,
        windowComplete,
      }),
    );
  }

  // --- Planned campaigns get the MDE preview: the smallest effect this window
  // could detect, computable before any money moves.
  let plannedMde: Record<string, unknown> | undefined;
  if (campaign.status === "planned" && adminDb) {
    const key = metrics[0] ?? "d1.signups";
    const since = shiftDays(campaign.starts_on, -7 * baselineWeeks);
    const points = await readSeries(adminDb, key, since, today);
    const mde = minimumDetectableEffect({
      series: new Map(points.map((p) => [p.day, p.value])),
      startsOn: campaign.starts_on,
      endsOn: campaign.ends_on,
      baselineWeeks,
    });
    plannedMde = mde
      ? {
          metric: key,
          ...mde,
          note: `The smallest lift this window could call clear-movement is +${mde.absolute} (${mde.pct}% over the expected ${mde.expected}). If the effect being bought is smaller, the honest post-campaign answer will be "cannot tell".`,
        }
      : { metric: key, note: "Not enough baseline history to compute a minimum detectable effect yet." };
  }

  // --- Cost, as a range — a point estimate at n=7 with a floor of ±7 is false precision.
  let cost: Record<string, unknown> | null = null;
  const spendCents = campaign.spend_cents ?? campaign.budget_cents;
  const signups = Number(d1Tagged["d1_landed_in_window_signups"] ?? 0);
  if (spendCents && signups > 0) {
    // sqrt of the TAGGED count, not the site-wide floor. The lift entry's
    // noiseFloor is computed over every signup the site had in the window, so
    // borrowing it for a 7-signup campaign produced a range like [spend/32,
    // spend/1] — a 32x spread presented as an uncertainty interval.
    const floor = Math.sqrt(signups);
    const low = Math.max(1, Math.round(signups - floor));
    const high = Math.round(signups + floor);
    cost = {
      spend_cents: spendCents,
      cost_per_tagged_signup_cents: Math.round(spendCents / signups),
      cost_per_signup_range_cents: [Math.round(spendCents / high), Math.round(spendCents / low)],
      note: `The range comes from the noise floor on ${signups} signups: some of them are consistent with ordinary variance, so a point estimate would be false precision.`,
    };
  }

  // --- Rival explanations, listed rather than argued away.
  const concurrent = adminDb
    ? (
        await listEvents(
          adminDb,
          { from: shiftDays(campaign.starts_on, -2), to: shiftDays(campaign.ends_on, 2), includeHidden: true },
          now,
        )
      )
        .filter((e) => e.campaign_id !== campaign.id)
        .map((e) => ({ id: e.id, on: e.occurred_on, kind: e.kind, label: e.label }))
    : [];

  const duringComplete = campaign.ends_on <= shiftDays(today, -2);
  const postFrom = shiftDays(campaign.ends_on, 1);
  const postTo = shiftDays(campaign.ends_on, D);
  const postComplete = postTo <= shiftDays(today, -2);

  return {
    campaign: {
      id: campaign.id,
      utm_campaign: campaign.utm_campaign,
      platform: campaign.platform,
      starts_on: campaign.starts_on,
      ends_on: campaign.ends_on,
      status: campaign.status,
      budget_cents: campaign.budget_cents,
      spend_cents: campaign.spend_cents,
      hypothesis: campaign.hypothesis,
      outcome: campaign.outcome,
    },
    windows: {
      during: { from: campaign.starts_on, to: campaign.ends_on, days: D, complete: duringComplete },
      pre: { from: shiftDays(campaign.starts_on, -D), to: shiftDays(campaign.starts_on, -1), days: D },
      post: postComplete ? { from: postFrom, to: postTo, days: D } : null,
      ...(postComplete ? {} : { post_reason: `post window incomplete until ${shiftDays(postTo, 2)}` }),
    },
    tagged: { ...ga4Tagged, ...d1Tagged },
    lift,
    ...(plannedMde ? { planned_mde: plannedMde } : {}),
    cost,
    concurrent_events: concurrent,
    caveats: [
      "This is a before/after comparison against matched weekdays, not an experiment. Nothing was held back as a control; any change shipped in the same window is an equally good explanation — concurrent_events lists them.",
      "GA4 sessions and D1 signups are two different populations measured by two different systems. Dividing one by the other is not a conversion rate.",
      "First-touch attribution requires the gb_attr cookie, which is consent-gated: EEA/UK visitors who decline are ABSENT from d1 signups entirely, not counted as direct. A Europe-targeted campaign is undercounted by an unknown amount.",
      "Both GA4 (Zaraz) and gb_attr are client-side, so ad-blocked visitors are missing from both — from D1 more heavily, since the cookie must also survive the OAuth round trip.",
      "Attribution data starts 2026-08-15 and cannot be backfilled.",
    ],
    unavailable: [
      "Visitors who arrived from the ad and never signed up, individually. GA4 counts them in aggregate; nothing ties one landing to one outcome (Workers Analytics Engine is not bound).",
      "Impressions, clicks and cost from the ad platform. spend_cents is whatever a human typed in.",
      "Any attribution model other than first touch — last-touch/multi-touch would be invented from data that was never captured.",
      "Formal statistical significance. sigmas is a Poisson-style ratio, not a hypothesis test, and there is no correction for reading several metrics.",
    ],
  };
}
