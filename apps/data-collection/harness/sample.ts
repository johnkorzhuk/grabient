/**
 * Deterministic coeff-space sampler: generates candidate palettes without any
 * LLM by (a) random sampling within sane coefficient ranges biased toward the
 * current coverage gaps and (b) perturbing approved seeds. The Worker dedups,
 * so oversampling is harmless. Run: pnpm harness:sample [--run-id id] [--count n]
 */
import {
  cosineGradient,
  rgbToHex,
  analyzeCoefficients,
  tagsToArray,
  isValidPaletteCoeffs,
  type CosineCoeffs,
} from "@repo/data-ops/gradient-gen";

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
const runId = argValue("--run-id") ?? `sample-${Date.now()}`;
const count = Number(argValue("--count") ?? 40);

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function randomCoeffs(): CosineCoeffs {
  // Ranges chosen so a +/- b stays mostly inside [0,1]: offset mid-range,
  // moderate amplitude, frequency low enough to avoid banding.
  const a = () => rand(0.25, 0.75);
  const b = () => rand(0.05, 0.5);
  const c = () => rand(0.25, 1.25);
  const d = () => rand(0, 1);
  return [
    [a(), a(), a(), 1],
    [b(), b(), b(), 1],
    [c(), c(), c(), 1],
    [d(), d(), d(), 1],
  ] as CosineCoeffs;
}

function flat12(coeffs: CosineCoeffs): number[] {
  return coeffs.flatMap((row) => [row[0], row[1], row[2]]);
}

async function api(path: string, body?: unknown, method = "POST") {
  const res = await fetch(`${API_URL}${path}`, {
    method: body ? method : "GET",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const coverage = (await api("/api/coverage", undefined)) as {
    gaps: Array<{ kind: string; value: string; count: number }>;
  };
  const gapTags = new Set(
    coverage.gaps.filter((g) => g.kind === "tag").map((g) => g.value),
  );
  console.log(`targeting gap tags: ${[...gapTags].join(", ") || "(none yet)"}`);

  const batch: Array<{ coeffs: number[] }> = [];
  let attempts = 0;
  while (batch.length < count && attempts < count * 30) {
    attempts++;
    const coeffs = randomCoeffs();
    if (!isValidPaletteCoeffs(coeffs)) continue;
    // Bias toward coverage gaps: once we have gap data, keep 1 in 4 random
    // palettes unconditionally (exploration) and require the rest to hit a gap.
    if (gapTags.size > 0 && attempts % 4 !== 0) {
      const tags = tagsToArray(analyzeCoefficients(coeffs));
      if (!tags.some((t) => gapTags.has(t))) continue;
    }
    // Drop washed-out palettes: require some spread between rendered stops.
    const stops = cosineGradient(5, coeffs).map(([r, g, b]) => rgbToHex(r, g, b));
    if (new Set(stops).size < 3) continue;
    batch.push({ coeffs: flat12(coeffs) });
  }

  const chunkSize = 20;
  let accepted = 0;
  let rejected = 0;
  for (let i = 0; i < batch.length; i += chunkSize) {
    const result = (await api("/api/palettes/batch", {
      runId,
      source: "sampled",
      palettes: batch.slice(i, i + chunkSize),
    })) as { accepted: unknown[]; rejected: unknown[] };
    accepted += result.accepted.length;
    rejected += result.rejected.length;
  }
  console.log(
    `sampled ${batch.length} candidates: ${accepted} accepted, ${rejected} rejected (dupes/invalid)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
