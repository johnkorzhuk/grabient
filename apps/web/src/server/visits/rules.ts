/* What tells a person's visit from a program's beyond what the request says of itself (visits.ts), shared by the reader
   of the counts (mcp/admin/visits.ts) and the feed to Google Analytics (ga4.ts). No imports. */

/** Networks of the large clouds programs run from: Amazon, Google, Alibaba, Tencent and Huawei. The hosting providers
    VPNs exit through (M247, Datacamp, Hetzner, OVH, DigitalOcean and the like) and Microsoft's, which carries Windows
    365 and Azure Virtual Desktop, are not among them: people browse through those. */
export const HOSTING: readonly string[] = [
  "16509",
  "14618",
  "15169",
  "396982",
  "45102",
  "37963",
  "132203",
  "45090",
  "136907",
  "55990"
];

/** The browsers whose versions keep Chrome's, which update themselves every four weeks. */
const CHROMIUMS = ["Chrome", "Edge", "WebView"];
/** How many versions behind the leading one a browser may be and still be a person's. */
export const BEHIND = 6;
/** How far behind Chrome's stable version a Firefox may be: it updates itself every four weeks as Chrome does, a version
    ahead of it, and its extended support release, a year behind at most, is still a person's. */
const FIREFOX_BEHIND = 17;
/** The oldest Safari still a person's: 16 is iOS 16's, the last an iPhone 8 or X runs, and on 21 Oct 2026 it came many
    times as often as Safari 26, from the programs that pass for people. */
const SAFARI_OLDEST = 17;
/** A version leads when this share of its browser's visitors has it, and three of them at least: a beta's few do not. */
const LEADS = 0.03;
const LABEL = /^[\w .-]{1,40}$/;

/** A browser label's name and major version ("Chrome 155"), or null. */
export function versionOf(browser: string): { name: string; major: number } | null {
  const found = /^(.+) (\d+)$/.exec(browser);
  if (!found || !LABEL.test(browser)) return null;
  const major = Number(found[2]);
  return Number.isSafeInteger(major) ? { name: found[1]!, major } : null;
}

/** Each Chromium's leading version and the labels more than `BEHIND + slack` versions behind it. The leading version
    is `lead`, Chrome's stable one, where it is known (keys.ts); else the newest a share of its browser's visitors had,
    which a program's thousands on one version make their own. `slack` widens the line for a window long enough for
    the lead to move within it. */
export function behind(
  rows: readonly { browser: string; visitors: number }[],
  slack = 0,
  lead: number | null = null
): { leading: Record<string, number>; old: string[] } {
  const leading: Record<string, number> = {};
  const old: string[] = [];
  for (const name of CHROMIUMS) {
    const versions = rows
      .map(row => ({ row, version: versionOf(row.browser) }))
      .filter(({ version }) => version?.name === name)
      .map(({ row, version }) => ({ row, major: version!.major }));
    if (!versions.length) continue;
    const all = versions.reduce((sum, { row }) => sum + row.visitors, 0);
    const led =
      lead ??
      versions
        .filter(({ row }) => row.visitors >= Math.max(3, all * LEADS))
        .reduce((top, { major }) => Math.max(top, major), 0);
    if (!led) continue;
    leading[name] = led;
    for (const { major, row } of versions) if (major < led - BEHIND - slack) old.push(row.browser);
  }
  // Firefox and Safari are weighed against Chrome's line, however it was found
  const chrome = lead ?? leading.Chrome ?? null;
  if (chrome) {
    for (const row of rows) {
      const version = versionOf(row.browser);
      const line =
        version && !CHROMIUMS.includes(version.name) ? oldest(version.name, chrome, slack) : null;
      if (line !== null && version!.major < line) old.push(row.browser);
    }
  }
  return { leading, old };
}

/** The oldest major version of a browser that is still a person's, against Chrome's stable version `lead`, or null for
    a browser no line is drawn for. */
function oldest(name: string, lead: number, slack = 0): number | null {
  if (CHROMIUMS.includes(name)) return lead - BEHIND - slack;
  if (name === "Firefox") return lead - FIREFOX_BEHIND - slack;
  if (name === "Safari") return SAFARI_OLDEST;
  return null;
}

/** Whether a browser label is older than a person's would be, against `lead`, Chrome's stable version: a Chromium
    more than BEHIND versions behind it, a Firefox more than FIREFOX_BEHIND, a Safari before SAFARI_OLDEST. */
export function tooOld(browser: string, lead: number | null): boolean {
  if (!lead) return false;
  const version = versionOf(browser);
  const line = version ? oldest(version.name, lead) : null;
  return line !== null && version!.major < line;
}
