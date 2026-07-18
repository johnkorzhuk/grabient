/**
 * Caption-vision helper: turns a caption-lease response (JSON file with a
 * `palettes` array) into labeled preview strips of true site renders, so the
 * captioning session can LOOK at the palettes it writes queries for.
 *
 * Usage (from a caption skill session):
 *   harness/dc-api.sh /api/caption/lease -X POST -H "Content-Type: application/json" \
 *     -d '{"runId":"...","limit":12}' > <dir>/lease.json
 *   npx tsx harness/palette-strips.ts --in <dir>/lease.json --out <dir>
 * Then Read <dir>/0.png (8 rows per image, row index = palette order in
 * lease.json).
 */
import { readFileSync } from "node:fs";
import { buildStrips, type StripRow } from "./strips";

const args = process.argv.slice(2);
function argValue(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}
const inPath = argValue("--in");
const outDir = argValue("--out");
if (!inPath || !outDir) {
  console.error("usage: palette-strips.ts --in <lease.json> --out <dir>");
  process.exit(1);
}
const leasePath: string = inPath;
const stripDir: string = outDir;

async function main() {
  const parsed = JSON.parse(readFileSync(leasePath, "utf8")) as {
    palettes?: StripRow[];
  };
  const rows = parsed.palettes ?? [];
  if (rows.length === 0) {
    console.log("no palettes to render");
    return;
  }
  const { siteRendered } = await buildStrips(rows, stripDir);
  console.log(
    `rendered ${rows.length} palettes to ${stripDir} (${siteRendered} site renders); row index = lease order`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
