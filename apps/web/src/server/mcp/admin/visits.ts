import type { Env } from "@grabient/server/env.ts";
import { DATASETS } from "./usage.ts";

/* The visits the Worker counts (server/visits/visits.ts), read back from Workers Analytics Engine through the deploy's
   ANALYTICS binding for the site_visits tool. A visit is a person's when its request said nothing a program's would
   (no signals), its browser, where it is a Chromium, is no more than six versions behind the one the window's people
   lead with, and its network is no hosting provider's. People are counted by their visitor's code, which is a day's
   alone: a reader on two days is two visitor-days, so a week's or a month's visitors are fewer than its visitor-days.
   Each check is kept beside the totals, so a rule that leaves people out shows: what share of a day's visitors used a
   palette, a collection or the search, site-wide and by country and network, where programs that pass for browsers
   use nothing. */

/** Networks of hosting providers, where people rarely browse from: Amazon, Google, Microsoft, Alibaba, Tencent, Huawei,
    DigitalOcean, OVH, Hetzner, Linode, Vultr, Oracle, Contabo, M247, Datacamp, ColoCrossing, FranTech, Clouvider,
    netcup, WorldStream and Voxility. Cloudflare's, Akamai's and Fastly's are not among them: iCloud Private Relay and
    WARP carry people through those. */
export const HOSTING = [
  "16509",
  "14618",
  "15169",
  "396982",
  "8075",
  "45102",
  "37963",
  "132203",
  "45090",
  "136907",
  "55990",
  "14061",
  "16276",
  "24940",
  "63949",
  "20473",
  "31898",
  "51167",
  "9009",
  "60068",
  "212238",
  "36352",
  "53667",
  "62240",
  "197540",
  "49981",
  "3223"
];
/** The countries whose visits carry no visitor's code (server/visits/visits.ts). */
const UNCODED = new Set(["CN", "VN"]);
/** The browsers whose versions keep Chrome's, which update themselves every four weeks. */
const CHROMIUMS = ["Chrome", "Edge", "WebView"];
/** How many versions behind the leading one a browser may be and still be a person's. */
const BEHIND = 6;
/** A version leads when this share of its browser's visitors has it, and three of them at least. */
const LEADS = 0.01;
/** A country or network whose visitors use palettes at under this share of the site's rate is shown for a look. */
const LOW = 1 / 3;
/** Visitors a country or network needs before its rate is weighed. */
const WEIGHED = 20;
/** The share of a day's people who use a palette, a collection or the search, as the site's own counts found it in
    October 2026 (about a third): a window far below it let programs in, far above it left people out. */
export const USUAL: readonly [number, number] = [0.2, 0.5];

/** A count of visitors and of what they did, under a value. */
export interface Row {
  value: string;
  visitors: number;
  count: number;
}
export interface Day {
  day: string;
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
  /** the window's sums: a reader on two days is two visitor-days */
  totals: Omit<Day, "day" | "visitors"> & { visitorDays: number; averageVisitors: number };
  /** people's page loads by their kind of page, language, country, device, browser and system */
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
}

const whole = (value: unknown) => Math.round(Number(value) || 0);
const LABEL = /^[\w .-]{1,40}$/;
const quoted = (values: readonly string[]) => values.map(value => `'${value}'`).join(", ");

/** The browsers more than BEHIND versions behind their own leading version, from the visitors each version had. */
export function behind(rows: readonly { browser: string; visitors: number }[]): {
  leading: Record<string, number>;
  old: string[];
} {
  const leading: Record<string, number> = {};
  const old: string[] = [];
  for (const name of CHROMIUMS) {
    const versions = rows
      .map(row => ({ major: Number(/^(.+) (\d+)$/.exec(row.browser)?.[2]), row }))
      .filter(({ row }) => row.browser.startsWith(`${name} `) && LABEL.test(row.browser))
      .filter(({ major }) => Number.isSafeInteger(major));
    const all = versions.reduce((sum, { row }) => sum + row.visitors, 0);
    const led = versions
      .filter(({ row }) => row.visitors >= Math.max(3, all * LEADS))
      .reduce((top, { major }) => Math.max(top, major), 0);
    if (!led) continue;
    leading[name] = led;
    for (const { major, row } of versions) if (major < led - BEHIND) old.push(row.browser);
  }
  return { leading, old };
}

/** The last `days` of the deploy's visits, or the sentence that says why the deploy cannot read them. A query the
    service refuses throws. */
export async function readVisits(
  env: Pick<Env, "ANALYTICS" | "DEPLOYMENT">,
  days: number,
  limit = 20
): Promise<VisitsReport | string> {
  const binding = env.ANALYTICS;
  const dataset = DATASETS[env.DEPLOYMENT];
  if (!binding || !dataset) return "This deploy has no ANALYTICS binding to read its counts with.";
  const sql = async (query: string): Promise<Record<string, unknown>[]> => {
    const answer = (await binding.query({ query })) as { data?: unknown } | null;
    return Array.isArray(answer?.data) ? answer.data : [];
  };
  const span = Math.max(1, Math.min(90, Math.floor(days) || 7));
  const top = Math.max(1, Math.min(200, Math.floor(limit) || 20));
  const from = `FROM events.analyticsEngine.${dataset} WHERE timestamp >= NOW() - INTERVAL '${span}' DAY AND blob1 = 'visit'`;
  const pages = `${from} AND blob2 IN ('landing', 'load')`;
  const acts = `${from} AND blob2 IN ('use', 'search')`;
  const day = "toStartOfDay(timestamp) AS day";
  const people = "COUNT(DISTINCT blob15) AS visitors";

  const versions = await sql(
    `SELECT blob7 AS browser, ${people} ${pages} AND blob10 = '' GROUP BY browser`
  );
  const { leading, old } = behind(
    versions.map(row => ({ browser: String(row.browser ?? ""), visitors: whole(row.visitors) }))
  );
  const person = `AND blob10 = '' AND blob9 NOT IN (${quoted(HOSTING)})${old.length ? ` AND blob7 NOT IN (${quoted(old)})` : ""}`;
  const coded = "AND blob15 != ''";
  const grouped = (column: string, where: string, count = "SUM(double1) AS n") =>
    sql(
      `SELECT ${column} AS value, ${people}, ${count} ${where} GROUP BY value ORDER BY visitors DESC LIMIT ${top}`
    );

  const [
    byWhat,
    visitorsByDay,
    actingByDay,
    uncodedByDay,
    heldByDay,
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
      `SELECT ${day}, blob2 AS what, SUM(double1) AS n ${from} ${person} GROUP BY day, what ORDER BY day`
    ),
    sql(`SELECT ${day}, ${people} ${pages} ${person} ${coded} GROUP BY day ORDER BY day`),
    sql(`SELECT ${day}, ${people} ${acts} ${person} ${coded} GROUP BY day ORDER BY day`),
    sql(
      `SELECT ${day}, SUM(double1) AS n ${pages} ${person} AND blob15 = '' GROUP BY day ORDER BY day`
    ),
    sql(`SELECT ${day}, SUM(double1) AS n ${pages} AND blob10 = 'held' GROUP BY day ORDER BY day`),
    grouped("blob3", `${pages} ${person}`),
    grouped("blob4", `${pages} ${person}`),
    grouped("blob5", `${pages} ${person}`),
    grouped("blob6", `${pages} ${person}`),
    grouped("blob7", `${pages} ${person}`),
    grouped("blob8", `${pages} ${person}`),
    grouped("blob3", `${from} AND blob2 = 'landing' ${person}`),
    grouped("blob11", `${from} AND blob2 = 'landing' ${person}`),
    sql(
      `SELECT blob12 AS source, blob13 AS medium, blob14 AS campaign, ${people}, SUM(double1) AS n ${from} AND blob2 = 'landing' AND (blob12 != '' OR blob13 != '' OR blob14 != '') ${person} GROUP BY source, medium, campaign ORDER BY visitors DESC LIMIT ${top}`
    ),
    grouped("blob10", `${pages} AND blob10 NOT IN ('', 'held')`),
    old.length
      ? sql(
          `SELECT ${people}, SUM(double1) AS n ${pages} AND blob10 = '' AND blob7 IN (${quoted(old)})`
        )
      : Promise.resolve([]),
    sql(
      `SELECT ${people}, SUM(double1) AS n ${pages} AND blob10 = '' AND blob9 IN (${quoted(HOSTING)})`
    ),
    sql(
      `SELECT blob5 AS value, ${people} ${pages} ${person} ${coded} GROUP BY value ORDER BY visitors DESC LIMIT 200`
    ),
    sql(`SELECT blob5 AS value, ${people} ${acts} ${person} ${coded} GROUP BY value`),
    sql(
      `SELECT blob9 AS value, ${people} ${pages} ${person} ${coded} GROUP BY value ORDER BY visitors DESC LIMIT 200`
    ),
    sql(`SELECT blob9 AS value, ${people} ${acts} ${person} ${coded} GROUP BY value`)
  ]);

  const rows = (answer: Record<string, unknown>[]): Row[] =>
    answer.map(row => ({
      value: String(row.value ?? ""),
      visitors: whole(row.visitors),
      count: whole(row.n)
    }));
  const byDay = new Map<string, Day>();
  const dayRow = (value: unknown): Day => {
    const key = String(value).slice(0, 10);
    const held = byDay.get(key) ?? {
      day: key,
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
  for (const row of byWhat) {
    const held = dayRow(row.day);
    if (row.what === "landing") held.landings += whole(row.n);
    else if (row.what === "load") held.loads += whole(row.n);
    else if (row.what === "framed") held.framed += whole(row.n);
  }
  for (const row of visitorsByDay) dayRow(row.day).visitors = whole(row.visitors);
  for (const row of actingByDay) dayRow(row.day).acting = whole(row.visitors);
  for (const row of uncodedByDay) dayRow(row.day).uncoded = whole(row.n);
  for (const row of heldByDay) dayRow(row.day).held = whole(row.n);
  const daily = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
  const rate = (acting: number, visitors: number) =>
    visitors ? Math.round((acting / visitors) * 1000) / 1000 : null;
  for (const held of daily) held.share = rate(held.acting, held.visitors);

  const sum = (key: "visitors" | "landings" | "loads" | "framed" | "acting" | "uncoded" | "held") =>
    daily.reduce((total, held) => total + held[key], 0);
  const visitorDays = sum("visitors");
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
    visitors: whole(answer[0]?.visitors),
    count: whole(answer[0]?.n)
  });
  return {
    dataset,
    days: span,
    empty: !versions.length && !daily.length,
    daily,
    totals: {
      visitorDays,
      averageVisitors: daily.length ? Math.round(visitorDays / daily.length) : 0,
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
    }
  };
}
