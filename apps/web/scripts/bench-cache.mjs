#!/usr/bin/env node
// Cache/latency benchmark for the deployed worker. For each endpoint it fires
// N sequential requests and records status, Cf-Cache-Status (edge cache in
// front of the worker), X-Cache (KV render cache) and TTFB. The interesting
// signal is the transition: request 1 should MISS, requests 2..N should HIT on
// cacheable routes — every HIT is a request the worker (and D1/KV/AI) never saw.
//
// Usage:
//   node scripts/bench-cache.mjs https://grabient-lite.jkorzhuk.workers.dev [runs]
import { writeFileSync } from "node:fs";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!base.startsWith("http")) {
  console.error("Usage: node scripts/bench-cache.mjs <origin> [runs-per-endpoint]");
  process.exit(1);
}
const RUNS = Number(process.argv[3] ?? 6);
const SEED = "_gH0gGQgGQgH0gGQgEsgH0gH0gH0gAAgBkgDI";

// Cache-busting note: none. We measure the live cache exactly as users hit it.
const ENDPOINTS = [
  { name: "list-popular", path: "/" },
  { name: "list-newest", path: "/newest" },
  { name: "api-palettes", path: "/api/palettes?sort=newest" },
  { name: "seed-page", path: `/${SEED}` },
  { name: "search-page", path: "/palettes/blue" },
  { name: "og-palette", path: `/api/og?seed=${SEED}` },
  { name: "png-palette", path: `/api/png?seed=${SEED}` },
  { name: "og-query", path: "/api/og/query?query=blue" },
  { name: "png-query", path: "/api/png/query?query=blue" },
  { name: "sitemap", path: "/sitemap.xml" },
  { name: "like-counts", path: `/api/like-counts?keys=${SEED}` },
  { name: "static-page", path: "/contact" },
];

async function probe(url) {
  const started = performance.now();
  const res = await fetch(url, { redirect: "manual", headers: { "User-Agent": "grabient-bench" } });
  // TTFB approximation: headers received. Body is drained so keep-alive reuse
  // doesn't skew later samples.
  const ttfb = performance.now() - started;
  await res.arrayBuffer();
  return {
    status: res.status,
    edge: res.headers.get("cf-cache-status") ?? "-",
    kv: res.headers.get("x-cache") ?? "-",
    cc: res.headers.get("cache-control") ?? "-",
    cdncc: res.headers.get("cdn-cache-control") ?? "-",
    ttfb: Math.round(ttfb),
  };
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const report = { base, at: new Date().toISOString(), runs: RUNS, endpoints: {} };
for (const { name, path } of ENDPOINTS) {
  const samples = [];
  for (let i = 0; i < RUNS; i++) samples.push(await probe(base + path));
  const warm = samples.slice(1);
  report.endpoints[name] = {
    path,
    samples,
    first: samples[0],
    warmEdgeHits: warm.filter((s) => s.edge === "HIT").length,
    warmMedianTtfb: median(warm.map((s) => s.ttfb)),
  };
  const s0 = samples[0];
  console.log(
    `${name.padEnd(14)} ${String(s0.status).padEnd(4)} first[edge=${s0.edge} kv=${s0.kv} ${s0.ttfb}ms]` +
      ` warm[hits=${report.endpoints[name].warmEdgeHits}/${warm.length} median=${report.endpoints[name].warmMedianTtfb}ms]`,
  );
}

const out = process.env.BENCH_OUT;
if (out) {
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${out}`);
}
