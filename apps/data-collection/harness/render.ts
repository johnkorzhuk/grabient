/**
 * Renders the judge/audit queue to PNG strips so the Claude judge can look at
 * the actual gradients instead of reasoning purely over hex codes.
 *
 * Rows are true site renders fetched from the public /api/png endpoint
 * (style/steps/angle honored, no logo), with a dense local gradient as
 * fallback — the stored 8 hex stops alias high-frequency palettes into
 * stripes they don't have, so neither path judges from those directly.
 *
 * Writes <out-dir>/<n>.png (one image per batch of up to 8 pairs, each row
 * labeled with its index) plus <out-dir>/queue.json with the pair payloads
 * in the same order. Run via loop.sh before judge/audit.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildStrips, writeQueue, type StripRow } from "./strips";

const API_URL = process.env.DC_API_URL;
const API_KEY = process.env.DC_API_KEY;
if (!API_URL || !API_KEY) {
  console.error("set DC_API_URL and DC_API_KEY");
  process.exit(1);
}

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const mode = argValue("--mode") ?? "judge";
const runId = argValue("--run-id") ?? `render-${Date.now()}`;
const limit = Number(argValue("--limit") ?? 24);
const tier = argValue("--tier");
// Parallel judge loops must not share a render dir (buildStrips wipes its
// out-dir first) - loop.sh passes a per-run dir.
const outDir = argValue("--out-dir") ?? join("harness", "renders", mode);

interface QueuePair extends StripRow {
  queryId: string;
  queryText: string;
  tags: string[];
  storedScore?: number | null;
  storedVerdict?: string | null;
  storedJudgeModel?: string | null;
}

async function fetchQueue(): Promise<QueuePair[]> {
  const path =
    mode === "audit"
      ? `/api/judge/audit/sample?n=${limit}`
      : "/api/judge/lease";
  const res = await fetch(`${API_URL}${path}`, {
    method: mode === "audit" ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body:
      mode === "audit"
        ? undefined
        : JSON.stringify({ runId, limit, ...(tier ? { tier } : {}) }),
  });
  if (!res.ok) throw new Error(`queue fetch failed: ${res.status}`);
  const data = (await res.json()) as { pairs: QueuePair[] };
  return data.pairs;
}

async function main() {
  const queue = await fetchQueue();

  const { siteRendered } = await buildStrips(queue, outDir);

  // Blind judging: strip ALL stored-* fields from what the judge sees.
  const publicQueue = queue.map(
    ({ storedScore: _s, storedVerdict: _v, storedJudgeModel: _m, ...rest }, i) => ({
      index: i,
      ...rest,
    }),
  );
  writeQueue(outDir, publicQueue);
  if (mode === "audit") {
    writeFileSync(
      join(outDir, "stored-scores.json"),
      JSON.stringify(
        queue.map((p, i) => ({
          index: i,
          storedScore: p.storedScore ?? null,
          storedVerdict: p.storedVerdict ?? null,
          storedJudgeModel: p.storedJudgeModel ?? null,
        })),
        null,
        2,
      ),
    );
  }

  console.log(
    `rendered ${queue.length} pairs to ${outDir} (${siteRendered} site renders, ${queue.length - siteRendered} fallbacks)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
