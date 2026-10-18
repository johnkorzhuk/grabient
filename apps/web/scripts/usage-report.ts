/* What the site's own work came to, as the admins' site_usage tool reads it, printed as Markdown: MCP tool calls, apps
   signing in, requests a limit refused, old addresses, pictures, palette files, the errors pages reported and the
   answers that failed. It reads the deploy's dataset through `cf sql query`, with this machine's Cloudflare sign-in, in
   the account --account or CLOUDFLARE_ACCOUNT_ID names. Nothing here names a person: the counts never did.
   From apps/web:
   node scripts/usage-report.ts [--days 7] [--mode staging|production] [--account ID] [--out FILE] */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { readUsage, USAGE_EVENTS } from "../src/server/mcp/admin/usage.ts";

const TITLES: Record<(typeof USAGE_EVENTS)[number], string> = {
  mcp: "MCP tool calls",
  oauth: "Apps signing in",
  limit: "Requests a limit refused",
  legacy: "Old grabient.com addresses",
  image: "Pictures",
  "client-error": "Errors pages reported",
  "script-load": "Scripts browsers could not load",
  file: "Palette files fetched",
  failure: "Answers that failed"
};
const ROWS = 40;

const { values } = parseArgs({
  options: {
    days: { type: "string", default: "7" },
    mode: { type: "string", default: "staging" },
    account: { type: "string", default: process.env.CLOUDFLARE_ACCOUNT_ID ?? "" },
    out: { type: "string" }
  }
});
const mode = values.mode;
if (mode !== "staging" && mode !== "production")
  throw new Error(`--mode is staging or production, not ${mode}`);
const account = values.account;
if (!/^[0-9a-f]{32}$/.test(account))
  throw new Error("Name the Cloudflare account with --account or CLOUDFLARE_ACCOUNT_ID.");

const cf = join(import.meta.dirname, "../node_modules/.bin/cf");
const report = await readUsage(
  {
    DEPLOYMENT: mode,
    ANALYTICS: {
      query: async ({ query }) =>
        JSON.parse(
          execFileSync(cf, ["sql", "query", query, "--scope-account", account], {
            encoding: "utf8",
            maxBuffer: 64 * 1024 ** 2
          })
        )
    }
  },
  Number(values.days)
);
if (typeof report === "string") throw new Error(report);

const cell = (value: unknown) => String(value).replace(/\|/g, "\\|");
/** A Markdown table whose last `counts` columns are numbers, set to the right. */
const table = (head: string[], rows: unknown[][], counts = 1) => [
  `| ${head.join(" | ")} |`,
  `|${head.map((_, i) => (i < head.length - counts ? "---" : "---:")).join("|")}|`,
  ...rows.map(row => `| ${row.map(cell).join(" | ")} |`),
  ""
];
const lines = [`# What the site did, ${mode}, the last ${report.days} days`, ""];
if (report.empty) {
  lines.push(`Nothing counted yet: \`${report.dataset}\` holds nothing until its first point.`, "");
} else {
  lines.push(
    `${USAGE_EVENTS.map(event => `${TITLES[event]}: ${report.totals[event]}`).join(". ")}.`,
    ""
  );
  if (report.ceilings.length)
    lines.push(
      `A ceiling for the whole site refused requests: ${report.ceilings.map(c => `${c.limit} (${c.count})`).join(", ")}.`,
      ""
    );
  for (const event of USAGE_EVENTS) {
    const rows = report.events[event];
    const first = rows[0];
    if (!first) continue;
    const columns = Object.keys(first).filter(column => column !== "count");
    lines.push(
      `## ${TITLES[event]}`,
      "",
      ...table(
        [...columns, "count"],
        rows.slice(0, ROWS).map(row => [...columns.map(column => row[column]), row.count])
      )
    );
  }
  if (report.daily.length)
    lines.push(
      "## By day",
      "",
      ...table(
        ["day", ...USAGE_EVENTS],
        report.daily.map(day => [day.day, ...USAGE_EVENTS.map(event => day[event])]),
        USAGE_EVENTS.length
      )
    );
}
const text = lines.join("\n");
if (values.out) writeFileSync(values.out, text);
else console.log(text);
