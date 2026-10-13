/* Training, step 1: every training palette through the engine and the package's own features, so the model learns from
   the numbers the Worker computes. Reads train/data/pairs.json and, unless --no-app, cache/app-pairs.json (the site's
   collections, from `index.ts pairs`). Writes cache/features.npy and cache/rows.json.
     node scripts/search/train-features.ts [--no-app] */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { canonical, decodePalette } from "@grabient/engine";
import { anchorsFromHexes } from "@grabient/engine/spec.ts";
import { FEATURES, paletteFeatures } from "@grabient/search/features.ts";
import { writeNpy } from "./npy.ts";
import { CACHE as cache, TRAIN } from "./paths.ts";

interface Pair {
  phrase: string;
  source: string;
  /** a palette by hex colors, written by a model or a formula, or by seed, a palette of the site */
  colors?: string[];
  seed?: string;
  fold?: number;
}

mkdirSync(cache, { recursive: true });
const read = (file: string): Pair[] => JSON.parse(readFileSync(file, "utf8")) as Pair[];
const appFile = resolve(cache, "app-pairs.json");
const app = existsSync(appFile) && !process.argv.includes("--no-app") ? read(appFile) : [];

const phrases: string[] = [];
const at = new Map<string, number>();
const rows: { p: number; source: string; fold?: number }[] = [];
const vectors: Float32Array[] = [];
const started = Date.now();
for (const pair of [...read(resolve(TRAIN, "data/pairs.json")), ...app]) {
  const raw = pair.seed ? decodePalette(pair.seed) : anchorsFromHexes(pair.colors ?? []);
  if (!raw) continue;
  if (!at.has(pair.phrase)) {
    at.set(pair.phrase, phrases.length);
    phrases.push(pair.phrase);
  }
  rows.push({
    p: at.get(pair.phrase) as number,
    source: pair.source,
    ...(pair.fold === undefined ? {} : { fold: pair.fold })
  });
  vectors.push(paletteFeatures(canonical(raw)).vector);
}
const flat = new Float32Array(rows.length * FEATURES);
vectors.forEach((v, i) => {
  flat.set(v, i * FEATURES);
});
writeNpy(resolve(cache, "features.npy"), rows.length, FEATURES, flat);
writeFileSync(resolve(cache, "rows.json"), JSON.stringify({ phrases, rows }));
console.log(
  `${rows.length} palettes (${app.length} from the site), ${phrases.length} phrases, ${((Date.now() - started) / Math.max(1, rows.length)).toFixed(2)} ms each`
);
