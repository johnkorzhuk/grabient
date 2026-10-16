/* A deploy's smoke check, the cutover day's above all: the pages a reader opens first, the public API, a palette's files,
   an old grabient.com link, the MCP server's sign-in challenge and every address of a saved list. It only reads.
   From apps/web:
     node scripts/smoke.ts <base>                          the checks, against a deploy (https://grabient.com)
     node scripts/smoke.ts <base> --urls FILE              and every address in FILE answers 200, or one 301 to a 200
     node scripts/smoke.ts <base> --save-sitemap FILE      the deploy's sitemap addresses into FILE, one a line
   Before the cutover, save grabient.com's addresses with --save-sitemap; after it, replay them with --urls. On
   grabient.com each page they land on must also be indexed and name an indexed page as canonical; every other deploy
   says noindex. Exits 1 on any failure, with the failing addresses under each rule. */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import links from "../data/legacy-links.json" with { type: "json" };

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { urls: { type: "string" }, "save-sitemap": { type: "string" } }
});
const base = (positionals[0] ?? "").replace(/\/$/, "");
if (!/^https?:\/\//.test(base)) {
  console.error("Usage: node scripts/smoke.ts <base> [--urls FILE] [--save-sitemap FILE]");
  process.exit(2);
}

const TIMEOUT_MS = 20_000;
const AT_ONCE = 8;
const get = (path: string, init: RequestInit = {}) =>
  fetch(path.startsWith("http") ? path : base + path, {
    redirect: "manual",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    ...init
  });

/** Every <loc> of a sitemap, and of the sitemaps an index names. */
export async function sitemapUrls(from: string): Promise<string[]> {
  const read = async (url: string): Promise<string[]> => {
    const xml = await (await get(url)).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]!.trim());
    return xml.includes("<sitemapindex") ? (await Promise.all(locs.map(read))).flat() : locs;
  };
  return read(`${from}/sitemap.xml`);
}

if (values["save-sitemap"]) {
  const urls = await sitemapUrls(base);
  writeFileSync(values["save-sitemap"], `${urls.join("\n")}\n`);
  console.log(`${urls.length} addresses written to ${values["save-sitemap"]}`);
  process.exit(0);
}

let failed = 0;
const report = (ok: boolean, name: string, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
};
async function check(name: string, run: () => Promise<string | true>) {
  try {
    const answer = await run();
    report(answer === true, name, answer === true ? "" : answer);
  } catch (error) {
    report(false, name, error instanceof Error ? error.message : String(error));
  }
}
/** A page drawn whole: a 200 of HTML, a title, and no error page in its place. */
const page = (path: string) =>
  check(`page ${path}`, async () => {
    const response = await get(path, { headers: { Accept: "text/html" } });
    const html = await response.text();
    if (response.status !== 200) return `answered ${response.status}`;
    if (!/<title[^>]*>[^<]+/.test(html)) return "no title";
    if (html.includes("Something went wrong")) return "drew the error page";
    return true;
  });

const sitemap = await sitemapUrls(base).catch(() => [] as string[]);
const local = (url: string) => new URL(url).pathname;
/** The first page a sitemap of the deploy names: a palette's, a collection's. */
const firstIn = async (name: string) => {
  const xml = await (await get(`/sitemap-${name}.xml`)).text();
  const loc = /<loc>([^<]+)<\/loc>/.exec(xml)?.[1];
  return loc ? local(loc) : undefined;
};
const palette = await firstIn("palettes").catch(() => undefined);
const collection = await firstIn("collections").catch(() => undefined);

await check("sitemap", async () => (sitemap.length > 100 ? true : `${sitemap.length} addresses`));
// the newsletter stays hidden until an admin turns it on, so it is no page a deploy must answer
for (const path of [
  "/",
  "/palettes",
  "/palettes/rising",
  "/collections",
  "/collections/rising",
  "/about"
])
  await page(path);
if (collection) await page(collection);
if (palette) await page(palette);

await check("api palettes", async () => {
  const response = await get("/api/palettes?sort=popular");
  const body = (await response.json()) as { items?: unknown[] };
  return response.status === 200 && (body.items?.length ?? 0) > 0
    ? true
    : `answered ${response.status}`;
});
await check("api collections", async () => {
  const response = await get("/api/collections");
  const body = (await response.json()) as { items?: unknown[] };
  return response.status === 200 && (body.items?.length ?? 0) > 0
    ? true
    : `answered ${response.status}`;
});
// the build that answers, for the day's record
await check("build", async () => {
  const response = await get("/api/build");
  const build = /build;desc="([^"]+)"/.exec(response.headers.get("server-timing") ?? "")?.[1];
  if (response.status !== 204 || !build) return `answered ${response.status}`;
  console.log(`      serving build ${build}`);
  return true;
});
if (palette) {
  for (const [ext, type] of [
    ["png", "image/png"],
    ["svg", "image/svg+xml"],
    ["css", "text/css"],
    ["json", "application/json"]
  ] as const) {
    await check(`file ${ext}`, async () => {
      const response = await get(`${palette}.${ext}`);
      const got = response.headers.get("content-type") ?? "";
      return response.status === 200 && got.startsWith(type) ? true : `${response.status} ${got}`;
    });
  }
}
for (const path of ["/robots.txt", "/llms.txt"])
  await check(`file ${path}`, async () => ((await get(path)).status === 200 ? true : "missing"));

await check("old link", async () => {
  const [old, seed] = Object.entries(links as Record<string, string>)[0]!;
  const response = await get(`/${old}`);
  const to = response.headers.get("location") ?? "";
  return response.status === 301 && to.includes(seed) ? true : `${response.status} to ${to}`;
});
await check("mcp asks for sign-in", async () => {
  const response = await get("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
  const challenge = response.headers.get("www-authenticate") ?? "";
  return response.status === 401 && challenge.startsWith("Bearer")
    ? true
    : `${response.status} ${challenge}`;
});
await check("mcp sign-in metadata", async () => {
  const response = await get("/.well-known/oauth-protected-resource/mcp");
  return response.status === 200 ? true : `answered ${response.status}`;
});

if (values.urls) {
  const urls = readFileSync(values.urls, "utf8")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  /* what each address must do; the two index rules hold on grabient.com alone */
  const RULES = {
    lands: "answer 200, or one 301 to a 200",
    indexed: "land on a page whose robots meta says index",
    canonical: "name as canonical a page that answers 200 and says index"
  } as const;
  type Rule = keyof typeof RULES;
  const indexedBase = new URL(base).origin === "https://grabient.com";
  /** A page's answer, with its robots and its canonical where it is HTML. */
  const read = async (at: string) => {
    const response = await get(at, { headers: { Accept: "text/html" } });
    const html = (response.headers.get("content-type") ?? "").includes("text/html")
      ? await response.text()
      : null;
    if (html === null) await response.body?.cancel();
    const tag = (pattern: RegExp) => html && pattern.exec(html)?.[1]?.replaceAll("&amp;", "&");
    return {
      at: new URL(at, base).toString(),
      status: response.status,
      location: response.headers.get("location"),
      robots: tag(/<meta name="robots" content="([^"]*)"/),
      canonical: tag(/<link rel="canonical" href="([^"]*)"/)
    };
  };
  const indexed = (robots: string | null | undefined) => !!robots?.startsWith("index");
  /** The first rule an address breaks, or null. */
  const broken = async (path: string): Promise<Rule | null> => {
    const first = await read(path);
    const landed =
      first.status === 301 ? await read(new URL(first.location ?? "", base).toString()) : first;
    if (landed.status !== 200) return "lands";
    if (!indexedBase || landed.robots === null) return null;
    if (!indexed(landed.robots)) return "indexed";
    if (!landed.canonical) return "canonical";
    if (new URL(landed.canonical).toString() === landed.at) return null;
    const named = await read(landed.canonical);
    return named.status === 200 && indexed(named.robots) ? null : "canonical";
  };
  const failing = new Map<Rule, string[]>();
  let next = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]!;
      const path = local(url) + new URL(url).search;
      const rule = await broken(path).catch((): Rule => "lands");
      if (rule) failing.set(rule, [...(failing.get(rule) ?? []), path]);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, worker));
  const bad = [...failing.values()].reduce((sum, paths) => sum + paths.length, 0);
  report(!bad, `${urls.length} saved addresses`, bad ? `${bad} fail` : "");
  for (const [rule, paths] of failing) {
    console.log(`      ${paths.length} that should ${RULES[rule]}:`);
    for (const path of paths) console.log(`        ${path}`);
  }
}

console.log(failed ? `\n${failed} failed` : "\nEvery check passed.");
process.exit(failed ? 1 : 0);
