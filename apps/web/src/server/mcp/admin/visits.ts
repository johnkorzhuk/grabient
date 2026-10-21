import type { Env } from "@grabient/server/env.ts";
import { leadName } from "../../visits/keys.ts";
import { behind, HOSTING } from "../../visits/rules.ts";
import { DATASETS } from "./usage.ts";

/* The visits the Worker counts (server/visits/visits.ts), read back from Workers Analytics Engine through the deploy's
   ANALYTICS binding for the site_visits tool. A visit is a person's when its request said nothing a program's would
   (no signals), its browser, where it is a Chromium, is no more than six versions behind Chrome's stable one as KV
   keeps it (visits/keys.ts; where none is kept, the newest a share of the window's visitors had), a version more for
   each four weeks of window as it moves, and its network is none of the large clouds' (visits/rules.ts). People are counted by their visitor's code, which is a day's alone: a reader on two days
   is two visitor-days, so a week's or a month's visitors are fewer than its visitor-days. A page in a partner's frame
   is a page the person saw. The window is whole UTC days, today's so far the last of them and marked partial. Each
   check is kept beside the totals, so a rule that leaves people out shows: what share of a day's visitors used a
   palette, a collection or the search, site-wide and by country and network, where programs that pass for browsers
   use nothing. A query the service refuses past the first leaves its part empty and is named in `failed`; the first
   refused, the tool says why. */

/** The countries whose visits carry no visitor's code (server/visits/visits.ts). */
const UNCODED = new Set(["CN", "VN"]);
/** A country or network whose visitors use palettes at under this share of the site's rate is shown for a look. */
const LOW = 1 / 3;
/** Visitors a country or network needs before its rate is weighed. */
const WEIGHED = 20;
/** The share of a day's people who use a palette, a collection or the search, as the site's own counts found it in
    October 2026 (about a third): a window far below it let programs in, far above it left people out. */
export const USUAL: readonly [number, number] = [0.2, 0.5];
/** How many of the report's queries run at once: the SQL API publishes no limit, and the tool asks it about twenty. */
const AT_ONCE = 4;

/** A count of visitors and of what they did, under a value. */
export interface Row {
  value: string;
  visitors: number;
  count: number;
}
export interface Day {
  day: string;
  /** today's, still counting */
  partial?: true;
  /** people by their code */
  visitors: number;
  landings: number;
  loads: number;
  framed: number;
  /** people who used a palette, a collection or the search, and their share of the day's visitors */
  acting: number;
  share: number | null;
  /** pages a person's browser loaded with no code: in China or Vietnam, or before the day's key was read */
  uncoded: number;
  /** pages of a browser that sends Global Privacy Control or Do Not Track, counted and nothing else */
  held: number;
}
export interface VisitsReport {
  dataset: string;
  days: number;
  empty: boolean;
  daily: Day[];
  /** the window's sums: a reader on two days is two visitor-days; the average is of whole days alone */
  totals: Omit<Day, "day" | "visitors" | "partial"> & {
    visitorDays: number;
    averageVisitors: number;
  };
  /** people's pages by their kind of page, language, country, device, browser and system */
  by: Record<"page" | "language" | "country" | "device" | "browser" | "system", Row[]>;
  /** landings by the page, the site that sent them and their campaign tags */
  landings: Record<"page" | "referrer" | "campaign", Row[]>;
  /** what was left out as a program's */
  programs: {
    signals: Row[];
    leading: Record<string, number>;
    old: { visitors: number; count: number };
    hosting: { visitors: number; count: number };
  };
  /** the window's share of people who used a palette, a collection or the search against the usual, and the countries
      and networks whose visitors use them far less than the site's (`count` their share in thousandths) */
  check: {
    share: number | null;
    usual: readonly [number, number];
    outside: boolean;
    countries: Row[];
    networks: Row[];
  };
  /** the parts a refused query left empty */
  failed?: string[];
}

const whole = (value: unknown) => Math.round(Number(value) || 0);
const quoted = (values: readonly string[]) => values.map(value => `'${value}'`).join(", ");

/** The visitors under a value, less the one an uncoded point adds: COUNT(DISTINCT) counts its empty code as a visitor. */
const people = (row: Record<string, unknown>) =>
  Math.max(0, whole(row.visitors) - (whole(row.uncoded) > 0 ? 1 : 0));

/** The last `days` whole UTC days of the deploy's visits and today's so far, or the sentence that says why the deploy
    cannot read them. A query the service refuses leaves its part empty and is named in `failed`. */
export async function readVisits(
  env: Pick<Env, "ANALYTICS" | "DEPLOYMENT" | "CACHE">,
  days: number,
  limit = 20
): Promise<VisitsReport | string> {
  const binding = env.ANALYTICS;
  const dataset = DATASETS[env.DEPLOYMENT];
  if (!binding || !dataset) return "This deploy has no ANALYTICS binding to read its counts with.";
  const failed: string[] = [];
  let running = 0;
  const waiting: (() => void)[] = [];
  const sql = async (
    name: string,
    query: string,
    must = false
  ): Promise<Record<string, unknown>[]> => {
    if (running >= AT_ONCE) await new Promise<void>(go => waiting.push(go));
    running++;
    try {
      const answer = (await binding.query({ query })) as { data?: unknown } | null;
      return Array.isArray(answer?.data) ? answer.data : [];
    } catch (error) {
      if (must) throw error;
      failed.push(`${name}: ${error instanceof Error ? error.message.slice(0, 120) : "refused"}`);
      return [];
    } finally {
      running--;
      waiting.shift()?.();
    }
  };
  const span = Math.max(1, Math.min(90, Math.floor(days) || 7));
  const top = Math.max(1, Math.min(200, Math.floor(limit) || 20));
  // the window's first midnight, as the SQL API takes a bound: an ISO 8601 time with its zone
  const start = new Date(
    Math.floor(Date.now() / 86_400_000) * 86_400_000 - span * 86_400_000
  ).toISOString();
  const from = `FROM events.analyticsEngine.${dataset} WHERE timestamp >= '${start.slice(0, 19)}Z' AND blob1 = 'visit'`;
  const seen = "blob2 IN ('landing', 'load', 'framed')";
  const pages = `${from} AND ${seen}`;
  const acts = `${from} AND blob2 IN ('use', 'search')`;
  const day = "toStartOfDay(timestamp) AS day";
  const counted = "COUNT(DISTINCT blob15) AS visitors, sumIf(double1, blob15 = '') AS uncoded";

  const versions = await sql(
    "versions",
    `SELECT blob7 AS browser, COUNT(DISTINCT blob15) AS visitors ${pages} AND blob10 = '' AND blob15 != '' GROUP BY browser`,
    // the first query answers for the binding and the dataset: refused, the tool says why
    true
  );
  const kept = await env.CACHE?.get<{ lead?: unknown }>(leadName, "json").catch(() => null);
  const { leading, old } = behind(
    versions.map(row => ({ browser: String(row.browser ?? ""), visitors: whole(row.visitors) })),
    Math.floor(span / 28),
    typeof kept?.lead === "number" ? kept.lead : null
  );
  const personIs = `blob10 = '' AND blob9 NOT IN (${quoted(HOSTING)})${old.length ? ` AND blob7 NOT IN (${quoted(old)})` : ""}`;
  const person = `AND ${personIs}`;
  const coded = "AND blob15 != ''";
  const grouped = (name: string, column: string, where: string, order = "visitors") =>
    sql(
      name,
      `SELECT ${column} AS value, ${counted}, SUM(double1) AS n ${where} GROUP BY value ORDER BY ${order} DESC LIMIT ${top}`
    );

  const [
    sums,
    visitorsByDay,
    actingByDay,
    page,
    language,
    country,
    device,
    browser,
    system,
    landingPage,
    referrer,
    campaign,
    signals,
    oldRows,
    hostingRows,
    countryVisitors,
    countryActing,
    networkVisitors,
    networkActing
  ] = await Promise.all([
    sql(
      "daily",
      `SELECT ${day},
        sumIf(double1, blob2 = 'landing' AND ${personIs}) AS landings,
        sumIf(double1, blob2 = 'load' AND ${personIs}) AS loads,
        sumIf(double1, blob2 = 'framed' AND ${personIs}) AS framed,
        sumIf(double1, ${seen} AND blob15 = '' AND ${personIs}) AS uncoded,
        sumIf(double1, ${seen} AND blob10 = 'held') AS held
        ${from} GROUP BY day ORDER BY day`
    ),
    sql(
      "visitors",
      `SELECT ${day}, COUNT(DISTINCT blob15) AS visitors ${pages} ${person} ${coded} GROUP BY day ORDER BY day`
    ),
    sql(
      "acting",
      `SELECT ${day}, COUNT(DISTINCT blob15) AS visitors ${acts} ${person} ${coded} GROUP BY day ORDER BY day`
    ),
    grouped("pages", "blob3", `${pages} ${person}`),
    grouped("languages", "blob4", `${pages} ${person}`),
    // by pages, so China and Vietnam, whose visitors go uncounted, stand where their pages put them
    grouped("countries", "blob5", `${pages} ${person}`, "n"),
    grouped("devices", "blob6", `${pages} ${person}`),
    grouped("browsers", "blob7", `${pages} ${person}`),
    grouped("systems", "blob8", `${pages} ${person}`),
    grouped("landing pages", "blob3", `${from} AND blob2 = 'landing' ${person}`),
    grouped("referrers", "blob11", `${from} AND blob2 = 'landing' ${person}`),
    sql(
      "campaigns",
      `SELECT blob12 AS source, blob13 AS medium, blob14 AS campaign, ${counted}, SUM(double1) AS n ${from} AND blob2 = 'landing' AND (blob12 != '' OR blob13 != '' OR blob14 != '') ${person} GROUP BY source, medium, campaign ORDER BY visitors DESC LIMIT ${top}`
    ),
    grouped("signals", "blob10", `${pages} AND blob10 NOT IN ('', 'held')`),
    old.length
      ? sql(
          "old browsers",
          `SELECT ${counted}, SUM(double1) AS n ${pages} AND blob10 = '' AND blob7 IN (${quoted(old)})`
        )
      : Promise.resolve([]),
    sql(
      "hosting",
      `SELECT ${counted}, SUM(double1) AS n ${pages} AND blob10 = '' AND blob9 IN (${quoted(HOSTING)})`
    ),
    sql(
      "check: countries",
      `SELECT blob5 AS value, COUNT(DISTINCT blob15) AS visitors ${pages} ${person} ${coded} GROUP BY value ORDER BY visitors DESC LIMIT 200`
    ),
    sql(
      "check: countries acting",
      `SELECT blob5 AS value, COUNT(DISTINCT blob15) AS visitors ${acts} ${person} ${coded} GROUP BY value`
    ),
    sql(
      "check: networks",
      `SELECT blob9 AS value, COUNT(DISTINCT blob15) AS visitors ${pages} ${person} ${coded} GROUP BY value ORDER BY visitors DESC LIMIT 200`
    ),
    sql(
      "check: networks acting",
      `SELECT blob9 AS value, COUNT(DISTINCT blob15) AS visitors ${acts} ${person} ${coded} GROUP BY value`
    )
  ]);

  const rows = (answer: Record<string, unknown>[]): Row[] =>
    answer.map(row => ({
      value: String(row.value ?? ""),
      visitors: people(row),
      count: whole(row.n)
    }));
  const today = new Date().toISOString().slice(0, 10);
  const byDay = new Map<string, Day>();
  const dayRow = (value: unknown): Day => {
    const key = String(value).slice(0, 10);
    const held = byDay.get(key) ?? {
      day: key,
      ...(key === today ? { partial: true as const } : {}),
      visitors: 0,
      landings: 0,
      loads: 0,
      framed: 0,
      acting: 0,
      share: null,
      uncoded: 0,
      held: 0
    };
    byDay.set(key, held);
    return held;
  };
  for (const row of sums) {
    const held = dayRow(row.day);
    held.landings = whole(row.landings);
    held.loads = whole(row.loads);
    held.framed = whole(row.framed);
    held.uncoded = whole(row.uncoded);
    held.held = whole(row.held);
  }
  for (const row of visitorsByDay) dayRow(row.day).visitors = whole(row.visitors);
  for (const row of actingByDay) dayRow(row.day).acting = whole(row.visitors);
  const daily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const rate = (acting: number, visitors: number) =>
    visitors ? Math.round((acting / visitors) * 1000) / 1000 : null;
  for (const held of daily) held.share = rate(held.acting, held.visitors);

  const sum = (key: "visitors" | "landings" | "loads" | "framed" | "acting" | "uncoded" | "held") =>
    daily.reduce((total, held) => total + held[key], 0);
  const visitorDays = sum("visitors");
  const wholeDays = daily.filter(held => !held.partial);
  const site = rate(sum("acting"), visitorDays);
  /** The values whose visitors act at under LOW of the site's rate, with their own rate as `count` in thousandths. */
  const low = (visitors: Record<string, unknown>[], acting: Record<string, unknown>[]): Row[] => {
    if (site === null) return [];
    const acted = new Map(acting.map(row => [String(row.value ?? ""), whole(row.visitors)]));
    return visitors
      .map(row => ({ value: String(row.value ?? ""), visitors: whole(row.visitors) }))
      .filter(row => row.visitors >= WEIGHED)
      .map(row => ({
        ...row,
        count: Math.round(((acted.get(row.value) ?? 0) / row.visitors) * 1000)
      }))
      .filter(row => row.count < site * LOW * 1000)
      .slice(0, top);
  };
  const first = (answer: Record<string, unknown>[]) => ({
    visitors: answer[0] ? people(answer[0]) : 0,
    count: whole(answer[0]?.n)
  });
  return {
    dataset,
    days: span,
    empty: !versions.length && !daily.length,
    daily,
    totals: {
      visitorDays,
      averageVisitors: wholeDays.length
        ? Math.round(wholeDays.reduce((total, held) => total + held.visitors, 0) / wholeDays.length)
        : 0,
      landings: sum("landings"),
      loads: sum("loads"),
      framed: sum("framed"),
      acting: sum("acting"),
      share: site,
      uncoded: sum("uncoded"),
      held: sum("held")
    },
    by: {
      page: rows(page),
      language: rows(language),
      // China's and Vietnam's pages carry no code, so their visitors go uncounted
      country: rows(country).map(row => (UNCODED.has(row.value) ? { ...row, visitors: 0 } : row)),
      device: rows(device),
      browser: rows(browser),
      system: rows(system)
    },
    landings: {
      page: rows(landingPage),
      referrer: rows(referrer),
      campaign: rows(
        campaign.map(row => ({
          ...row,
          value: [row.source, row.medium, row.campaign].map(tag => String(tag ?? "")).join(" / ")
        }))
      )
    },
    programs: { signals: rows(signals), leading, old: first(oldRows), hosting: first(hostingRows) },
    check: {
      share: site,
      usual: USUAL,
      outside: site !== null && (site < USUAL[0] || site > USUAL[1]),
      countries: low(countryVisitors, countryActing),
      networks: low(networkVisitors, networkActing)
    },
    ...(failed.length ? { failed } : {})
  };
}
