// Indexation + corpus: whether Google stored our pages, and what there is to
// store.

import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { readSeries } from "../db";
import { isoDay } from "../range";
import { inspectUrl, listSitemaps } from "../search-console";
import { fetchCorpus, listSweeps, runSweep } from "../sweep";
import { json, notConfigured, toolError } from "./helpers";

export function registerIndexation(server: McpServer, env: Env) {
  server.registerTool(
    "indexation",
    {
      description:
        "Whether Google has actually stored our pages — the headline question " +
        "after the 2026-08-17 indexation work (920 URLs submitted, 0 indexed was " +
        "the before-picture). action:'url' inspects ONE URL and is the only way " +
        "to tell 'ranks badly' from 'not in the index at all' — identical in " +
        "performance data, opposite fixes. action:'latest' and 'history' read " +
        "PERSISTED sweeps: cheap, and the only trend view (there is no aggregate " +
        "coverage API — the per-URL sweep IS the coverage report, which is why " +
        "it persists). action:'sweep' spends REAL quota: 2,000 URLs/day for the " +
        "whole property including humans clicking in Search Console; the nightly " +
        "cron already sweeps the full corpus, so a manual sweep is for after a " +
        "deploy — it is capped per call and refuses rather than exhausting the " +
        "budget. action:'sitemaps' is Google's own submitted-vs-indexed per " +
        "child sitemap — a coarser measure that will disagree with the sweep; " +
        "both are real. A URL outside sc-domain:grabient.com 403s: that means " +
        "'not our property', not 'not indexed'.",
      inputSchema: z.object({
        action: z.enum(["latest", "history", "url", "sweep", "sitemaps"]).optional(),
        url: z.string().url().optional(),
        bucket: z
          .enum([
            "indexed",
            "crawled_not_indexed",
            "discovered_not_indexed",
            "duplicate_canonical",
            "excluded_other",
            "error",
          ])
          .optional(),
        maxUrls: z.number().int().min(1).max(300).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      }),
      // NOT idempotent: action:'sweep' spends real Google quota that is shared
      // with the owner's own Search Console tab, so a retry costs something
      // real. Everything else here is a read.
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ action, url, bucket, maxUrls, limit }) => {
      const now = new Date();
      const db = env.ADMIN_DB;
      switch (action ?? "latest") {
        case "url": {
          if (!url) return toolError("action:'url' needs a url.");
          const result = await inspectUrl(env, now, url);
          return result
            ? json(result)
            : toolError(
                "Inspection failed — either GSC is not configured, the quota is exhausted (2,000/day), or the URL is outside the property.",
              );
        }
        case "sweep": {
          if (!db) return notConfigured("The metric store", "ADMIN_DB binding + migrations");
          const result = await runSweep(env, now, { trigger: "mcp", maxUrls: maxUrls ?? 50 });
          return json(result);
        }
        case "sitemaps": {
          const result = await listSitemaps(env, now);
          if (!result) return notConfigured("Search Console", "GSC_SERVICE_ACCOUNT");
          const sitemaps = (result.sitemaps as any[]).map((s) => ({
            ...s,
            contents: (s.contents ?? []).map((c: any) => ({
              ...c,
              indexedSharePct:
                Number(c.submitted) > 0
                  ? Math.round((Number(c.indexed) / Number(c.submitted)) * 1000) / 10
                  : null,
            })),
          }));
          return json({ property: result.property, sitemaps });
        }
        case "history": {
          if (!db) return notConfigured("The metric store", "ADMIN_DB binding + migrations");
          const sweeps = await listSweeps(db, limit ?? 30);
          const series = await readSeries(db, "index.indexed", "2026-08-01", isoDay(now));
          return json({
            sweeps,
            indexedSeries: series,
            note: "indexedSeries starts at the first complete sweep; earlier history does not exist and cannot be reconstructed — the API answers only 'now'.",
          });
        }
        case "latest": {
          if (!db) return notConfigured("The metric store", "ADMIN_DB binding + migrations");
          const sweeps = await listSweeps(db, 1);
          const latest = sweeps[0];
          if (!latest) {
            return json({
              note: "No sweeps yet. The nightly cron runs at 05:40 UTC; action:'sweep' runs a bounded one now.",
            });
          }
          const rows = bucket
            ? (
                await db
                  .prepare(
                    `SELECT url, bucket, coverage_state, page_fetch_state, last_crawl_at, google_canonical
                       FROM index_url_status WHERE sweep_id = ?1 AND bucket = ?2 LIMIT ?3`,
                  )
                  .bind(latest.id, bucket, Math.min(500, limit ?? 50))
                  .all()
              ).results
            : undefined;
          return json({ sweep: latest, ...(rows ? { rows, bucket } : {}) });
        }
      }
    },
  );

  server.registerTool(
    "corpus",
    {
      description:
        "What there is to index — the denominator for every indexation number. " +
        "palettesInD1 is a live COUNT on the production palettes table; the " +
        "sitemap count differs because the palette sitemap is capped at the " +
        "1,000 most-liked and drops seeds that fail to decode. Sitemap counts " +
        "come from the DEPLOYED grabient.com, not the repo — production has run " +
        "behind the working tree before. Two facts before reading any ratio: " +
        "/{seed} performs NO existence check (any decodable seed renders, so the " +
        "indexable URL space is unbounded and the sitemap is a chosen subset, " +
        "not an inventory), and the same palette is reachable at /palettes/{seed} " +
        "too — that duplicate class is why canonicals matter. Curated queries " +
        "are the allow-list deciding whether /palettes/{query} is indexable; " +
        "236 are publishable, only 49 are in the sitemap — the 187 gap is the " +
        "cheapest submission lever available. Name stats are dated constants " +
        "measured 2026-08-17 (computing them needs the palette serialization " +
        "stack this worker deliberately does not import).",
      inputSchema: z.object({ live: z.boolean().optional() }),
      annotations: { readOnlyHint: true },
    },
    async ({ live }) => {
      const thirtyDaysAgo = Date.now() - 30 * 86_400_000;
      const [totals, styles, liked] = await env.DB.batch<any>([
        env.DB.prepare(
          `SELECT COUNT(*) AS palettes, COUNT(DISTINCT style) AS styles,
                  MIN(created_at) AS oldest_ms, MAX(created_at) AS newest_ms,
                  SUM(CASE WHEN created_at > ?1 THEN 1 ELSE 0 END) AS added_30d
             FROM palettes`,
        ).bind(thirtyDaysAgo),
        env.DB.prepare(`SELECT style, COUNT(*) AS n FROM palettes GROUP BY style ORDER BY n DESC`),
        env.DB.prepare(`SELECT COUNT(DISTINCT palette_id) AS liked FROM likes`),
      ]);
      const corpus = live === false ? null : await fetchCorpus();
      return json({
        generated_at: new Date().toISOString(),
        palettesInD1: totals.results?.[0]?.palettes ?? null,
        stylesInD1: totals.results?.[0]?.styles ?? null,
        added30d: totals.results?.[0]?.added_30d ?? null,
        likedPalettes: liked.results?.[0]?.liked ?? null,
        byStyle: styles.results ?? [],
        sitemap: corpus
          ? { totalUrls: corpus.urls.length, byChild: corpus.byChild, cap: 1000 }
          : { note: "live:false — sitemap not fetched" },
        curatedQueries: {
          publishableTotal: 236,
          inSitemap: 49,
          unpublishedCurated: 187,
          scoreGate: 0.45,
          note: "POPULAR_SEARCHES(49) + FEATURED(6) + CURATED_THEMES(170) + EMOJI(40), 236 unique after normalization. Everything outside the list and under the 0.45 semantic score is noindex,follow by design — brand safety against doorway pages, not a bug.",
        },
        nameStats: {
          measuredAt: "2026-08-17",
          distinctNames: "857/868 (98.7%)",
          distinctTitles: "854/868 (14 duplicate titles, 1.6%)",
          modifierRetentionPct: 66.6,
          relatedLinkFrontier: 668,
          note: "Dated constants — recompute after large corpus changes; names are a pure function of the seed.",
        },
        urlShapes: [
          { shape: "/{seed}", bounded: false, indexable: true, note: "868 in sitemap; space unbounded" },
          { shape: "/palettes/{curated}", bounded: true, indexable: true, note: "49 submitted of 236 publishable" },
          { shape: "/palettes/{anything}", bounded: false, indexable: "score-gated", note: "noindex,follow under 0.45" },
          { shape: "/palettes/{seed}", bounded: false, indexable: true, note: "UNINTENDED duplicate of /{seed} — flagged to the owner" },
          { shape: "/?page=N ×3 sorts", bounded: true, indexable: true, note: "~108 pages, self-canonical, unsubmitted" },
        ],
      });
    },
  );
}
