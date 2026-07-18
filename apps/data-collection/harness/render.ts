/**
 * Renders the judge/audit queue to PNG strips so the Claude judge can look at
 * the actual gradients instead of reasoning purely over hex codes.
 *
 * Writes harness/renders/<mode>/<n>.png (one image per batch of up to 8 pairs,
 * each row labeled with its index) plus harness/renders/<mode>/queue.json with
 * the pair payloads in the same order. Run via loop.sh before judge/audit.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

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
// Parallel judge loops must not share a render dir (rmSync below would nuke
// a sibling's queue mid-run) - loop.sh passes a per-run dir.
const outDir = argValue("--out-dir") ?? join("harness", "renders", mode);

interface QueuePair {
  queryId: string;
  seed: string;
  queryText: string;
  hexStops: string[];
  tags: string[];
  storedScore?: number | null;
}

const ROW_H = 96;
const ROW_W = 960;
const LABEL_W = 40;
const PER_IMAGE = 8;

function rowSvg(pair: QueuePair, index: number, y: number): string {
  const stops = pair.hexStops
    .map(
      (hex, i) =>
        `<stop offset="${((i / (pair.hexStops.length - 1)) * 100).toFixed(1)}%" stop-color="${hex}"/>`,
    )
    .join("");
  return `
    <linearGradient id="g${index}" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>
    <rect x="0" y="${y}" width="${LABEL_W}" height="${ROW_H}" fill="#111"/>
    <text x="${LABEL_W / 2}" y="${y + ROW_H / 2 + 6}" font-family="monospace" font-size="18" fill="#fff" text-anchor="middle">${index}</text>
    <rect x="${LABEL_W}" y="${y + 4}" width="${ROW_W - LABEL_W - 4}" height="${ROW_H - 8}" fill="url(#g${index})"/>`;
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
    body: mode === "audit" ? undefined : JSON.stringify({ runId, limit }),
  });
  if (!res.ok) throw new Error(`queue fetch failed: ${res.status}`);
  const data = (await res.json()) as { pairs: QueuePair[] };
  return data.pairs;
}

async function main() {
  const queue = await fetchQueue();
  const dir = outDir;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  // Blind judging: strip stored scores from what the judge sees.
  const publicQueue = queue.map(({ storedScore: _s, ...rest }, i) => ({
    index: i,
    ...rest,
  }));
  writeFileSync(join(dir, "queue.json"), JSON.stringify(publicQueue, null, 2));
  if (mode === "audit") {
    writeFileSync(
      join(dir, "stored-scores.json"),
      JSON.stringify(queue.map((p, i) => ({ index: i, storedScore: p.storedScore ?? null })), null, 2),
    );
  }

  for (let i = 0; i < queue.length; i += PER_IMAGE) {
    const chunk = queue.slice(i, i + PER_IMAGE);
    const height = chunk.length * ROW_H;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ROW_W}" height="${height}">
      ${chunk.map((p, j) => rowSvg(p, i + j, j * ROW_H)).join("\n")}
    </svg>`;
    await sharp(Buffer.from(svg))
      .png()
      .toFile(join(dir, `${Math.floor(i / PER_IMAGE)}.png`));
  }
  console.log(`rendered ${queue.length} pairs to ${dir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
