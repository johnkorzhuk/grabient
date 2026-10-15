// The admins' liked palettes as candidates for the two marked cards of Popular: each in the view it was liked in, with
// its rank, likes and age in the local data, its stops as the list draws them and the CSS the card paints.
//   node candidates.mts <sqlite> > candidates.json
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { decodePalette } from "../../../packages/engine/src/codec.ts";
import { sampleStops } from "../../../packages/engine/src/curve.ts";
import { gradientCss } from "../../../packages/engine/src/css.ts";
import { hexToSrgb, srgbToLch } from "../../../packages/engine/src/color.ts";

const db = new DatabaseSync(process.argv[2], { readOnly: true });
const likes = JSON.parse(readFileSync(`${process.env.WORK}/grid/admin-likes.json`, "utf8"));
const order = db.prepare("SELECT seed, style, steps, angle, likes_count, created_at FROM k_palettes ORDER BY likes_count DESC, seed").all();
const rank = new Map(order.map((r, i) => [r.seed, i]));
const drawn = (seed: string, style: string, steps: number, angle: number) => {
  const p = decodePalette(seed);
  if (!p) return null;
  const hexes = sampleStops(p, Math.max(steps, p.anchors.length)).map(s => s.hex);
  const lch = hexes.map(h => srgbToLch(hexToSrgb(h)!));
  const L = lch.map(c => c[0]);
  const C = lch.map(c => c[1]);
  return {
    hexes,
    css: gradientCss(hexes, style as never, angle),
    lMean: L.reduce((a, b) => a + b) / L.length,
    lMin: Math.min(...L),
    lMax: Math.max(...L),
    cMean: C.reduce((a, b) => a + b) / C.length,
    hues: lch.filter(c => c[1] > 0.04).map(c => Math.round(c[2]))
  };
};
const out = { grid: [] as unknown[], candidates: [] as unknown[] };
for (const r of order.slice(0, 24)) out.grid.push({ ...r, rank: rank.get(r.seed), ...drawn(r.seed, r.style, r.steps, r.angle) });
const seen = new Set<string>();
for (const l of likes) {
  const key = `${l.seed}:${l.style}:${l.steps}:${l.angle}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const row = order[rank.get(l.seed) ?? -1];
  if (!row) continue;
  const d = drawn(l.seed, l.style, l.steps, l.angle);
  if (!d) continue;
  out.candidates.push({ ...l, rank: rank.get(l.seed), likes: row.likes_count, created_at: row.created_at, gallery: `${row.style}:${row.steps}:${row.angle}`, ...d });
}
console.log(JSON.stringify(out));
