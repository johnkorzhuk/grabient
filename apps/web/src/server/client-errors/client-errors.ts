import { readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import type { Env } from "@grabient/server/env.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits } from "@grabient/server/limits/check.ts";
import { countUsage } from "@grabient/server/usage/count.ts";
import * as v from "valibot";
import { NO_STORE } from "../../lib/cache.ts";
import { isCrawler } from "../crawlers.ts";

/* Errors pages report from readers' browsers (app/error-report.ts): POST /api/client-error, always answered 204,
   logged as an error for Workers Issues and the Worker's logs (each keeps it seven days) and counted. The error holds
   the error's type and words, where in the site's own scripts it happened, the page (its kind, or a palette's or a
   collection's public address) and the browser's name and major version. Nothing names the reader: no address,
   account, cookie, full user agent, or a document's own address, which can be an account's collection. Each address
   reports at most 20 an hour and the site 5,000 a day; crawlers and other sites are refused. */

const clean = (max: number) =>
  v.pipe(
    v.string(),
    /* control characters out, but for tabs and line breaks, which a stack has */
    v.transform(text => text.replace(/[^\P{Cc}\t\n]/gu, "").slice(0, max))
  );
const place = v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(9_999_999));
const Report = v.object({
  /* the error's type: a value thrown that is no error has none, and neither has a report from an older page */
  name: v.fallback(v.pipe(v.string(), v.regex(/^[A-Za-z_$][\w$]{0,60}$/)), "Error"),
  message: v.pipe(clean(300), v.minLength(1)),
  stack: v.optional(clean(1500), ""),
  /* a path of the site's own, never an address with a query */
  source: v.optional(v.nullable(v.pipe(v.string(), v.regex(/^\/[^?#\s]{0,200}$/)))),
  line: v.optional(place),
  column: v.optional(place),
  /* a page's kind or a public address: an account's collection, which can be private, is never named */
  page: v.optional(v.pipe(v.string(), v.regex(/^[\w/.~-]{1,120}$/)), "unknown")
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

/* A stack's line in one of the site's scripts, and a script's path. A document's own lines are left out: its address can
   be an account's collection, and no page's address has a dot. */
const FRAME = /(\/[^\s():@]*\.m?js):\d+:\d+\)?$/;
const SCRIPT = /^\/[^\s():@]*\.m?js$/;
/** Without the build's hashes, as every deploy names a file: /assets/index-DMi2wf-V.js is /assets/index.js. */
const unhashed = (text: string) => text.replace(/-[\w-]{8}(?=\.(?:m?js|css)\b)/g, "");

type ClientError = NonNullable<ReturnType<typeof clientErrorOf>>;

/** The report as it is kept, or null when it is none. */
export function clientErrorOf(body: unknown, agent: string | null) {
  const read = v.safeParse(Report, body);
  if (!read.success) return null;
  const r = read.output;
  const source = r.source && SCRIPT.test(r.source) ? r.source : null;
  const frames = r.stack.split("\n").filter(line => FRAME.test(line));
  if (!frames.length && source) frames.push(`at ${source}:${r.line ?? "?"}:${r.column ?? "?"}`);
  const thrownIn = FRAME.exec(frames[0] ?? "")?.[1] ?? source;
  return {
    name: r.name,
    message: r.message,
    script: thrownIn ? unhashed(thrownIn).split("/").at(-1) : null,
    frames,
    page: r.page,
    browser: browserOf(agent)
  };
}

/** The report as Workers Issues takes it. Issues groups errors by their name and message alone, so the name says the
    error is the browser's, its type and the script it was thrown in, and neither names a build: one error is one issue
    on every page, browser and deploy. The stack holds the browser's own words and the rest. */
export function issueOf(report: ClientError): Error {
  const error = new Error(unhashed(report.message));
  error.name = `Browser ${report.name}${report.script ? ` in ${report.script}` : ""}`;
  error.stack = [
    `${error.name}: ${report.message}`,
    `    on ${report.page} in ${report.browser}`,
    ...report.frames.map(frame => `    ${frame}`)
  ].join("\n");
  return error;
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
  console.error(issueOf(report));
  /* the count keeps the kind of page and the browser alone: the words stay in the logs, which go after seven days */
  const kind = report.page.startsWith("/")
    ? report.page.startsWith("/k")
      ? "seed"
      : "collection"
    : report.page;
  countUsage(env, "client-error", kind, report.browser);
  return done();
}
