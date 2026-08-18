// The indexation sweep: ask Google, URL by URL, whether the corpus is in the
// index — persisted per URL and rolled up into metric_daily, because whether
// indexation improves is the headline question this dashboard exists to
// answer and Google offers no aggregate API for it.
//
// Enumeration fetches the LIVE sitemaps rather than deriving from D1, for the
// reasons the corpus ground-truth doc records: membership is decided by the
// sitemap route (top-1,000 by likes), URLs are canonicalSeed() forms that D1
// does not store, and the sitemap is what Google actually consumed — the
// semantically correct denominator. Two published query URLs are
// percent-encoded and must be inspected VERBATIM; nothing here ever calls
// decodeURIComponent on a <loc>.

import { chunk, closeRun, openRun, persist, rowsPerStatement, upsertMetrics, type MetricPoint } from "./db";
import { isoDay } from "./range";
import { inspectUrl } from "./search-console";

const SITEMAP_INDEX = "https://grabient.com/sitemap.xml";
/** GSC URL Inspection: 2,000/day and 600/min per property — pace well under. */
const DAILY_QUOTA = 2000;
/** Kept back for ad-hoc MCP url inspections after the sweep runs. */
const QUOTA_RESERVE = 400;
const PER_MINUTE_TARGET = 480;
const CONCURRENCY = 5;

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function unescapeXml(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m);
}

function locs(xml: string): string[] {
  const out: string[] = [];
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    out.push(unescapeXml(match[1]!.trim()));
  }
  return out;
}

export interface Corpus {
  urls: string[];
  byChild: Record<string, number>;
}

export async function fetchCorpus(): Promise<Corpus | null> {
  try {
    const indexRes = await fetch(SITEMAP_INDEX, { headers: { "user-agent": "grabient-admin-sweep" } });
    if (!indexRes.ok) {
      console.error(`sitemap index fetch failed (${indexRes.status})`);
      return null;
    }
    const children = locs(await indexRes.text());
    const urls: string[] = [];
    const byChild: Record<string, number> = {};
    for (const child of children) {
      const res = await fetch(child, { headers: { "user-agent": "grabient-admin-sweep" } });
      if (!res.ok) {
        console.error(`child sitemap fetch failed (${res.status}) ${child}`);
        return null; // a partial corpus would make the denominator lie
      }
      const childUrls = locs(await res.text());
      byChild[new URL(child).pathname] = childUrls.length;
      urls.push(...childUrls);
    }
    return { urls: [...new Set(urls)], byChild };
  } catch (err) {
    console.error("fetchCorpus threw", err);
    return null;
  }
}

/**
 * Normalized buckets, derived from the STABLE verdict enum first and the
 * prose coverageState only to split within it — Google rewords the prose
 * without notice, which is why the raw string is stored beside the bucket and
 * re-bucketing is an UPDATE, not a re-sweep.
 */
export function bucketOf(verdict: string | null, coverageState: string | null): string {
  if (verdict === "PASS") return "indexed";
  const coverage = (coverageState ?? "").toLowerCase();
  if (coverage.includes("crawled") && coverage.includes("not indexed")) return "crawled_not_indexed";
  if (coverage.includes("discovered")) return "discovered_not_indexed";
  if (coverage.includes("duplicate") || coverage.includes("canonical")) return "duplicate_canonical";
  if (coverage.includes("redirect")) return "excluded_other";
  if (verdict === "FAIL" || verdict === "PARTIAL" || verdict === "NEUTRAL") return "excluded_other";
  return "excluded_other";
}

export interface SweepResult {
  sweepId: number | null;
  status: "complete" | "partial" | "failed";
  corpusSize: number;
  inspected: number;
  indexed: number;
  apiErrors: number;
  buckets: Record<string, number>;
  quotaUsedToday: number;
  quotaRemainingToday: number;
  note?: string;
}

async function quotaUsedToday(db: D1Database, day: string): Promise<number> {
  try {
    const row = await db
      .prepare(`SELECT COALESCE(SUM(inspected), 0) AS used FROM index_sweep WHERE day = ?1`)
      .bind(day)
      .first<{ used: number }>();
    return row?.used ?? 0;
  } catch {
    return 0;
  }
}

/**
 * The full sweep: ~925 subrequests against the 10,000/invocation Workers Paid
 * limit and ~130 D1 statements against 1,000 — one invocation, no chunking.
 * What IS required is honesty on partial death: rows are written incrementally
 * and a sweep that dies publishes NO index.* metrics, so the headline chart
 * can never show a crash that only happened to the job.
 */
export async function runSweep(
  env: Env,
  now: Date,
  options: { trigger: "cron" | "mcp" | "ops"; maxUrls?: number } = { trigger: "cron" },
): Promise<SweepResult> {
  const db = env.ADMIN_DB;
  const day = isoDay(now);
  const empty: SweepResult = {
    sweepId: null,
    status: "failed",
    corpusSize: 0,
    inspected: 0,
    indexed: 0,
    apiErrors: 0,
    buckets: {},
    quotaUsedToday: 0,
    quotaRemainingToday: 0,
  };
  if (!db) return { ...empty, note: "ADMIN_DB is not configured." };

  const used = await quotaUsedToday(db, day);
  const budgetCap = Number(env.SWEEP_BUDGET ?? "1400");
  const remaining = Math.max(0, DAILY_QUOTA - QUOTA_RESERVE - used);
  if (remaining < 50) {
    return {
      ...empty,
      quotaUsedToday: used,
      quotaRemainingToday: remaining,
      note: `Refusing to sweep: only ${remaining} of today's inspection budget remains (${QUOTA_RESERVE} is reserved for ad-hoc inspections).`,
    };
  }

  const corpus = await fetchCorpus();
  if (!corpus) {
    await persist("index_sweep failed row", async () => {
      await db
        .prepare(
          `INSERT INTO index_sweep (day, started_at, status, mode, trigger, note)
           VALUES (?1, ?2, 'failed', 'full', ?3, 'corpus fetch failed — zero quota spent')`,
        )
        .bind(day, now.getTime(), options.trigger)
        .run();
    });
    return { ...empty, quotaUsedToday: used, quotaRemainingToday: remaining, note: "Sitemap fetch failed; zero quota spent." };
  }

  const cap = Math.min(corpus.urls.length, remaining, budgetCap, options.maxUrls ?? Infinity);
  const urls = corpus.urls.slice(0, cap);
  const mode = urls.length < corpus.urls.length ? "rotation" : "full";

  const sweepRow = await db
    .prepare(
      `INSERT INTO index_sweep (day, started_at, status, mode, trigger, corpus_size)
       VALUES (?1, ?2, 'running', ?3, ?4, ?5) RETURNING id`,
    )
    .bind(day, now.getTime(), mode, options.trigger, corpus.urls.length)
    .first<{ id: number }>();
  const sweepId = sweepRow?.id ?? null;
  if (sweepId === null) return { ...empty, note: "Could not open the sweep row." };

  const buckets: Record<string, number> = {};
  let inspected = 0;
  let apiErrors = 0;
  const perStmt = rowsPerStatement(14);

  const writeRows = async (rows: unknown[][]) => {
    const statements = chunk(rows, perStmt).map((group) => {
      const placeholders = group.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
      return db
        .prepare(
          `INSERT OR REPLACE INTO index_url_status
             (sweep_id, url, bucket, verdict, coverage_state, robots_state, indexing_state,
              page_fetch_state, last_crawl_at, google_canonical, user_canonical, crawled_as,
              referring_urls, error)
           VALUES ${placeholders}`,
        )
        .bind(...group.flat());
    });
    for (const group of chunk(statements, 40)) await db.batch(group);
  };

  // Paced batches: CONCURRENCY in flight, and each batch of 40 takes at least
  // 5s, keeping the rate near 480/min against the 600/min ceiling — which is
  // shared with a human clicking around Search Console.
  const BATCH = 40;
  const minBatchMs = (BATCH / PER_MINUTE_TARGET) * 60_000;
  try {
    for (let start = 0; start < urls.length; start += BATCH) {
      const batch = urls.slice(start, start + BATCH);
      const batchStarted = Date.now();
      const rows: unknown[][] = [];
      for (const slice of chunk(batch, CONCURRENCY)) {
        const results = await Promise.all(
          slice.map(async (url) => ({ url, result: await inspectUrl(env, now, url) })),
        );
        for (const { url, result } of results) {
          inspected += 1;
          if (!result) {
            apiErrors += 1;
            rows.push([sweepId, url, "error", null, null, null, null, null, null, null, null, null, null, "inspection failed"]);
            continue;
          }
          const bucket = bucketOf(
            (result.verdict as string) ?? null,
            (result.coverageState as string) ?? null,
          );
          buckets[bucket] = (buckets[bucket] ?? 0) + 1;
          rows.push([
            sweepId,
            url,
            bucket,
            result.verdict ?? null,
            result.coverageState ?? null,
            result.robotsTxtState ?? null,
            result.indexingState ?? null,
            result.pageFetchState ?? null,
            result.lastCrawlTime ? Date.parse(String(result.lastCrawlTime)) : null,
            result.googleCanonical ?? null,
            result.userCanonical ?? null,
            result.crawledAs ?? null,
            Array.isArray(result.referringUrls) ? result.referringUrls.length : null,
            null,
          ]);
        }
      }
      await persist("index_url_status batch", () => writeRows(rows));
      const elapsed = Date.now() - batchStarted;
      if (elapsed < minBatchMs && start + BATCH < urls.length) {
        await new Promise((resolve) => setTimeout(resolve, minBatchMs - elapsed));
      }
    }
  } catch (err) {
    // Died mid-sweep: quota is burned, rows so far are saved, and the sweep is
    // PARTIAL — it must not publish metrics.
    console.error("sweep aborted", err);
    await persist("index_sweep partial", async () => {
      await db
        .prepare(
          `UPDATE index_sweep SET finished_at = ?2, status = 'partial', inspected = ?3,
                  api_errors = ?4, buckets = ?5, note = ?6 WHERE id = ?1`,
        )
        .bind(sweepId, Date.now(), inspected, apiErrors, JSON.stringify(buckets), String(err).slice(0, 300))
        .run();
    });
    return {
      sweepId,
      status: "partial",
      corpusSize: corpus.urls.length,
      inspected,
      indexed: buckets["indexed"] ?? 0,
      apiErrors,
      buckets,
      quotaUsedToday: used + inspected,
      quotaRemainingToday: Math.max(0, remaining - inspected),
      note: "Sweep died mid-run; no index.* metrics were published for today.",
    };
  }

  const indexed = buckets["indexed"] ?? 0;
  const errorShare = inspected > 0 ? apiErrors / inspected : 1;
  // >5% API errors means the counts are materially understated — record the
  // sweep but do not publish a dip that is really a Google hiccup.
  const complete = mode === "full" && errorShare <= 0.05;
  const status = complete ? "complete" : "partial";

  await persist("index_sweep close", async () => {
    await db
      .prepare(
        `UPDATE index_sweep SET finished_at = ?2, status = ?3, inspected = ?4, api_errors = ?5,
                indexed = ?6, not_indexed = ?7, buckets = ?8 WHERE id = ?1`,
      )
      .bind(
        sweepId,
        Date.now(),
        status,
        inspected,
        apiErrors,
        indexed,
        Math.max(0, inspected - apiErrors - indexed),
        JSON.stringify(buckets),
      )
      .run();
  });

  if (complete) {
    const staleCutoff = now.getTime() - 7 * 86_400_000;
    const stale = await db
      .prepare(
        `SELECT COUNT(*) AS n FROM index_url_status
          WHERE sweep_id = ?1 AND (last_crawl_at IS NULL OR last_crawl_at < ?2)`,
      )
      .bind(sweepId, staleCutoff)
      .first<{ n: number }>();
    const points: MetricPoint[] = [
      { key: "index.corpus", day, value: corpus.urls.length },
      { key: "index.inspected", day, value: inspected },
      { key: "index.indexed", day, value: indexed },
      { key: "index.not_indexed", day, value: Math.max(0, inspected - apiErrors - indexed) },
      { key: "index.crawled_not_indexed", day, value: buckets["crawled_not_indexed"] ?? 0 },
      { key: "index.discovered_not_indexed", day, value: buckets["discovered_not_indexed"] ?? 0 },
      { key: "index.duplicate_canonical", day, value: buckets["duplicate_canonical"] ?? 0 },
      { key: "index.excluded_other", day, value: buckets["excluded_other"] ?? 0 },
      { key: "index.errors", day, value: apiErrors },
      { key: "index.stale_crawl_7d", day, value: stale?.n ?? 0 },
    ];
    await persist("index metrics", () => upsertMetrics(db, points, now.getTime()));
  }

  return {
    sweepId,
    status,
    corpusSize: corpus.urls.length,
    inspected,
    indexed,
    apiErrors,
    buckets,
    quotaUsedToday: used + inspected,
    quotaRemainingToday: Math.max(0, remaining - inspected),
    ...(complete ? {} : { note: "Partial sweep: recorded, but no index.* metrics published." }),
  };
}

/** The daily rollup read the MCP + pages use: sweeps, newest first. */
export async function listSweeps(
  db: D1Database | undefined,
  limit = 30,
): Promise<Array<Record<string, unknown>>> {
  if (!db) return [];
  try {
    const res = await db
      .prepare(
        `SELECT id, day, started_at, finished_at, status, mode, trigger, corpus_size,
                inspected, api_errors, indexed, not_indexed, buckets
           FROM index_sweep ORDER BY id DESC LIMIT ?1`,
      )
      .bind(Math.min(200, limit))
      .all();
    return (res.results ?? []).map((r: any) => ({
      ...r,
      buckets: r.buckets ? JSON.parse(r.buckets) : null,
    }));
  } catch (err) {
    console.error("listSweeps failed (migration pending?)", err);
    return [];
  }
}
