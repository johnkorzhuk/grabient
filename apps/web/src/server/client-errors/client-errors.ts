import { readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import * as v from "valibot";
import { NO_STORE } from "../../lib/cache.ts";
import { isCrawler } from "../crawlers.ts";

/* Errors pages report from readers' browsers (app/error-report.ts): POST /api/client-error, always answered 204,
   logged to the Worker's logs (kept seven days) and counted. A line holds the page (its kind, or a palette's or a
   collection's public address), the error's words, where in the site's own scripts it happened, and the browser's
   name and major version. Nothing names the reader: no address, account, cookie or full user agent. Each address
   reports at most 20 an hour and the site 5,000 a day; crawlers and other sites are refused. */

const clean = (max: number) =>
  v.pipe(
    v.string(),
    /* control characters out, but for tabs and line breaks, which a stack has */
    v.transform(text => text.replace(/[^\P{Cc}\t\n]/gu, "").slice(0, max))
  );
const place = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(9_999_999));
const Report = v.object({
  message: v.pipe(clean(300), v.minLength(1)),
  stack: v.optional(clean(1500), ""),
  /* a path of the site's own, never an address with a query */
  source: v.optional(v.nullable(v.pipe(v.string(), v.regex(/^\/[^?#\s]{0,200}$/)))),
  line: v.optional(place),
  column: v.optional(place),
  page: v.optional(v.pipe(v.string(), v.regex(/^[\w/.~@-]{1,120}$/)), "unknown")
});

const BROWSERS: readonly [string, RegExp][] = [
  ["Edge", /Edg\/(\d+)/],
  ["Opera", /OPR\/(\d+)/],
  ["Samsung Internet", /SamsungBrowser\/(\d+)/],
  ["Firefox", /Firefox\/(\d+)/],
  ["Chrome", /Chrome\/(\d+)/],
  ["Safari", /Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//]
];
/** The browser's name and major version from its user agent, and nothing else of it. */
export function browserOf(agent: string | null): string {
  const ua = agent ?? "";
  for (const [name, pattern] of BROWSERS) {
    const found = pattern.exec(ua);
    if (found)
      return `${name} ${found[1]}${/Mobile|Android|iPhone|iPad/.test(ua) ? " mobile" : ""}`;
  }
  return "other";
}

/** The report as it is kept, or null when it is none. */
export function clientErrorOf(body: unknown, agent: string | null) {
  const read = v.safeParse(Report, body);
  if (!read.success) return null;
  const r = read.output;
  return {
    page: r.page,
    message: r.message,
    at: r.source ? `${r.source}:${r.line ?? "?"}:${r.column ?? "?"}` : null,
    stack: r.stack,
    browser: browserOf(agent)
  };
}

export async function clientErrorResponse(request: Request, env: Env): Promise<Response> {
  const done = () => new Response(null, { status: 204, headers: NO_STORE });
  if (!sameOrigin(request) || isCrawler(request)) return done();
  const report = clientErrorOf(await readJson(request, 4096), request.headers.get("User-Agent"));
  if (!report) return done();
  const address = clientAddress(request) ?? "local";
  /* a limiter that cannot answer logs nothing */
  const allowed = await checkLimits(env, [
    [`client-error:${address}`, "clientError"],
    ["client-error", "clientErrorDaily"]
  ]);
  if (!allowed?.success) return done();
  console.error("client error", JSON.stringify(report));
  /* the count keeps the kind of page and the browser alone: the words stay in the logs, which go after seven days */
  const kind = report.page.startsWith("/")
    ? report.page.startsWith("/k")
      ? "seed"
      : "collection"
    : report.page;
  countUsage(env, "client-error", kind, report.browser);
  return done();
}
