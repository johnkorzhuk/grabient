// The machine-readable brief.
//
// This exists because the dashboard's real second reader is an AI agent helping
// with marketing, and an agent reading scraped HTML will confidently invent
// things the data does not support. So the same numbers are published as JSON
// with three extra sections that a chart cannot carry:
//
//   definitions  — what each metric counts, exactly. "Active users" meant three
//                  different things to three readers before this existed.
//   caveats      — the known distortions, attached to the data rather than left
//                  in someone's head. Bot contamination, IP-based uniques,
//                  maturing cohorts.
//   unavailable  — the questions this data CANNOT answer, named explicitly.
//                  This is the most valuable field: an agent that knows referrer
//                  attribution is missing will say so instead of fabricating a
//                  channel breakdown.
//
// Keep those three honest. Every future metric added to the dashboard should
// gain an entry here in the same commit.
import type { AttributionRow, Metrics } from "./queries";
import { cumulative } from "./queries";
import { automatedShare, recentBrowserPageViews, recentDailyUniques } from "./traffic";
import type { Acquisition, ReferrerRow, Traffic } from "./traffic";
import type { SearchConsole } from "./search-console";
import type { Ga4 } from "./ga4";

export interface Brief {
  generated_at: string;
  site: string;
  summary: string;
  metrics: Record<string, unknown>;
  series: Record<string, unknown>;
  acquisition: Record<string, unknown> | null;
  traffic_sources: Record<string, unknown> | null;
  search_console: Record<string, unknown> | null;
  attribution: Record<string, unknown>;
  definitions: Record<string, string>;
  caveats: string[];
  ga4: Ga4 | null;
  unavailable: string[];
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export function buildBrief(
  metrics: Metrics,
  traffic: Traffic | null,
  acquisition: Acquisition | null,
  search: SearchConsole | null = null,
  attribution: AttributionRow[] = [],
  referrers: ReferrerRow[] | null = null,
  ga4: Ga4 | null = null,
): Brief {
  const { totals, signups, likers, cohorts, currentMonth } = metrics;
  const lastSignups = signups.at(-1);
  const prevSignups = signups.at(-2);
  const activationRate = totals.users > 0 ? (totals.activated / totals.users) * 100 : 0;

  const monthlyConversion = traffic
    ? signups
        .filter((row) => {
          const month = traffic.monthly.get(row.month);
          if (!month) return false;
          const [year, mon] = row.month.split("-").map(Number);
          return month.days === new Date(Date.UTC(year!, mon!, 0)).getUTCDate();
        })
        .map((row) => ({
          month: row.month,
          signups: row.count,
          browser_pageviews: traffic.monthly.get(row.month)!.browserPageViews,
          signups_per_100k_browser_views: round(
            (row.count / Math.max(1, traffic.monthly.get(row.month)!.browserPageViews)) * 100000,
          ),
        }))
    : [];

  const first = monthlyConversion[0];
  const last = monthlyConversion.at(-1);

  const summary = [
    `grabient.com has ${totals.users.toLocaleString("en-US")} registered accounts`,
    traffic
      ? `and roughly ${recentBrowserPageViews(traffic, 7).toLocaleString("en-US")} browser pageviews a day, with ${Math.round(automatedShare(traffic, 30))}% of all pageviews coming from bots or unidentified clients`
      : "with no traffic data configured",
    `. ${lastSignups ? lastSignups.count : 0} people signed up in the last complete month`,
    `and ${round(activationRate)}% of all accounts have ever liked a palette`,
    first && last
      ? `, and signups per 100k browser pageviews went from ${first.signups_per_100k_browser_views} in ${first.month} to ${last.signups_per_100k_browser_views} in ${last.month}`
      : "",
    ".",
  ]
    .join(" ")
    .replace(/\s+\./g, ".")
    .replace(/\s+,/g, ",");

  return {
    generated_at: metrics.generatedAt.toISOString(),
    site: "grabient.com",
    summary,
    metrics: {
      registered_accounts: totals.users,
      accounts_that_ever_liked: totals.activated,
      activation_rate_pct: round(activationRate),
      palettes: totals.palettes,
      likes: totals.likes,
      signups_last_complete_month: lastSignups?.count ?? null,
      signups_previous_month: prevSignups?.count ?? null,
      signups_month_to_date: currentMonth.count,
      signups_month_to_date_projection: currentMonth.dayOfMonth
        ? Math.round((currentMonth.count / currentMonth.dayOfMonth) * currentMonth.daysInMonth)
        : null,
      browser_pageviews_per_day_7d: traffic ? recentBrowserPageViews(traffic, 7) : null,
      distinct_ips_per_day_7d: traffic ? recentDailyUniques(traffic, 7) : null,
      automated_share_pct_30d: traffic ? round(automatedShare(traffic, 30)) : null,
      signups_per_100k_browser_views_latest: last?.signups_per_100k_browser_views ?? null,
    },
    series: {
      signups_by_month: signups.map((row) => ({ month: row.month, signups: row.count })),
      cumulative_accounts: cumulative(metrics).map((point) => ({
        at: point.date.toISOString(),
        total: point.total,
      })),
      accounts_liking_by_month: likers.map((row) => ({
        month: row.month,
        accounts: row.likers,
        likes: row.likes,
      })),
      activation_by_signup_cohort: cohorts.map((row) => ({
        cohort: row.month,
        users: row.users,
        activated: row.activated,
        rate_pct: row.users > 0 ? round((row.activated / row.users) * 100) : null,
      })),
      conversion_by_month: monthlyConversion,
      traffic_by_day: traffic
        ? traffic.daily.map((day) => ({
            date: day.date,
            browser_pageviews: day.browserPageViews,
            automated_pageviews: day.automatedPageViews,
            distinct_ips: day.uniques,
          }))
        : [],
    },
    acquisition: acquisition
      ? {
          window_days: acquisition.days,
          requests_considered: acquisition.total,
          countries: acquisition.countries,
          devices: acquisition.devices,
          top_content_paths: acquisition.pages,
        }
      : null,

    attribution: {
      // Shipped 2026-08-15. Accounts created before that have no attribution and
      // never will — there is no way to reconstruct where someone came from
      // after the fact. Percentages must be taken over attributed_accounts, not
      // over registered_accounts, or every channel looks like a rounding error
      // next to 3,554 unattributable historical accounts.
      collected_since: "2026-08-15",
      attributed_accounts: attribution.reduce((sum, row) => sum + row.users, 0),
      by_first_touch_source: attribution.map((row) => ({
        source: row.source,
        signups: row.users,
        activated: row.activated,
        activation_rate_pct: row.users > 0 ? round((row.activated / row.users) * 100) : null,
      })),
    },

    traffic_sources: referrers
      ? {
          window_days: 7,
          source: "Cloudflare Web Analytics (RUM beacon)",
          collected_since: "2026-08-15",
          bot_free: true,
          note: "A browser beacon, so crawlers are absent without any heuristic. Internal links and the Google sign-in round trip are folded into 'Direct / no referrer'.",
          by_referrer: referrers,
        }
      : null,

    search_console: search
      ? {
          property: search.property,
          has_data: search.queries.length > 0,
          window_days: search.days,
          note: "Search Console lags about two days; this window ends before today.",
          totals: {
            clicks: search.totals.clicks,
            impressions: search.totals.impressions,
            ctr_pct: round(search.totals.ctr, 2),
            average_position: round(search.totals.position),
          },
          top_queries: search.queries,
          top_landing_pages: search.pages,
        }
      : null,

    definitions: {
      registered_accounts: "Rows in auth_user. Every account ever created, including dormant ones.",
      activation_rate_pct:
        "Share of ALL registered accounts that have ever liked at least one palette, over all time. Not a monthly figure.",
      accounts_liking_by_month:
        "Distinct signed-in accounts that liked >=1 palette in that month. This is NOT site traffic — liking requires an account, so it is a few dozen against tens of thousands of daily visitors. Do not present it as 'active users'.",
      browser_pageviews_per_day_7d:
        "Mean daily pageviews whose user-agent family is a recognized web browser, over the last 7 days. The closest available proxy for real people.",
      distinct_ips_per_day_7d:
        "Mean daily count of distinct client IPs, bots included. Not distinct people, and never valid to sum across days.",
      automated_share_pct_30d:
        "Share of pageviews over 30 days from clients that did not identify as a browser — named crawlers plus unrecognized user agents.",
      signups_per_100k_browser_views:
        "Signups in a month divided by that month's browser pageviews, times 100,000. Only computed for months fully covered by both sources.",
      top_content_paths:
        "Most-requested paths on grabient.com over the window, after removing API endpoints, analytics beacons and static assets.",
      search_console_top_queries:
        "The actual search terms that produced impressions and clicks, from Google Search Console. This is the only source in this brief that names HOW people arrived.",
      average_position:
        "Mean Google result position, weighted by impressions. A plain mean would let a keyword with three impressions at position 1 outrank the whole site.",
      attribution_by_first_touch_source:
        "Signups grouped by the utm_source (or external referrer host, or 'direct') recorded on their FIRST visit, with how many later liked a palette. The activation column is the point: the loudest channel and the channel that sends people who stay are routinely different.",
      traffic_sources_by_referrer:
        "Pageviews grouped by referring host, from the Cloudflare Web Analytics browser beacon. Already excludes bots (crawlers do not execute JavaScript), unlike every pageview figure in the traffic section. 'Direct / no referrer' also absorbs internal navigation and the OAuth round trip so the parts sum to the whole.",
    },

    caveats: [
      "First-touch attribution only exists for accounts created on or after 2026-08-15. Every earlier account has null attribution and cannot be backfilled — compute channel shares over attributed_accounts, never over registered_accounts.",
      "Attribution is first-touch and deliberately never overwritten: someone who arrives from a campaign and returns later via search is credited to the campaign, not the search.",
      "An account with a landing path but no source/medium/campaign arrived directly, with no campaign tags and no external referrer. That is a real answer, not missing data.",
      "Roughly half of all pageviews are automated. Any traffic number not explicitly labelled 'browser' includes bots.",
      "The bot split is a user-agent heuristic, not Cloudflare's bot score (Bot Management is not on this plan). It undercounts scrapers that spoof a browser user agent.",
      "Device mix reads as ~99% desktop, which is implausible for a consumer design tool and is itself evidence that automated traffic dominates the raw counts.",
      "Country and device breakdowns are NOT bot-filtered — those dimensions come from a dataset with no browser-family field to filter on.",
      "The newest signup cohorts are still maturing; their activation rate will rise as members return, so recent cohorts always look worse than older ones.",
      "The in-progress month is excluded from every monthly series. Its partial figure is reported separately as signups_month_to_date.",
      "Traffic-source data starts 2026-08-15, when Web Analytics was enabled. Comparisons against earlier periods are not possible for referrers specifically.",
      "Cloudflare zone analytics retains about 200 days, so no traffic comparison can reach further back than that.",
      "The acquisition breakdowns (country, device, top paths) cover only the last 24 hours: this plan caps that dataset at a 1-day query range. A single crawler run can reorder them, so do not read a one-day ranking as a trend.",
    ],

    // The only bot-filtered headcount in the brief; every other traffic figure
    // here includes automation unless it says otherwise.
    ga4,

    unavailable: [
      "Per-visitor journeys. Traffic sources are aggregate counts and first-touch attribution is per-account, so you can see that a referring site sent N visits and that M accounts carry a campaign tag, but not which individual visit became which signup.",
      "Sessions, bounce rate and time on page. Not derivable from Cloudflare request logs; auth_session is a login record with a rolling retention window, not a web analytics session.",
      ...(ga4
        ? [
            "Anything from PostHog, which is over its ingestion quota and is not queried here.",
          ]
        : [
            "Anything from GA4 or PostHog. GA4 needs GA4_PROPERTY_ID set and the service account granted Viewer on the property; PostHog is over its ingestion quota.",
          ]),
      ...(search
        ? search.queries.length === 0
          ? [
              `Search queries and rankings are not available YET. Search Console is connected to ${search.property} and authenticating correctly, but the property was verified recently and Google has not populated it. This is a wait, not a missing integration — do not report it as unavailable.`,
            ]
          : []
        : ["Search rankings, queries and impressions. Google Search Console is not connected."]),
    ],
  };
}
