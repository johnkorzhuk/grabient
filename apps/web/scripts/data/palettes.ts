/* The palette import: production's palettes and likes into the keyframe tables. The statements run inside a database
   that has had the migrations, over its own legacy `palettes` and `likes`, which they read and never write: in the
   copy build.ts makes, and in production itself at the cutover. Each is safe to run again, so a second run takes the
   likes made since the first. An old id reaches its seed through data/legacy-k.json, else data/legacy-links.json, the
   maps the Worker redirects old links with; a production palette in neither has no seed yet and stays out, named. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chunks, literal, WEB } from "./d1.ts";
import type { Row } from "./snapshot.ts";

export const STYLES = [
  "linearGradient",
  "linearSwatches",
  "radialGradient",
  "radialSwatches",
  "angularGradient",
  "angularSwatches"
];
const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** A seed's keyframes, in SQL: two plus the three bits after the version in its first character. */
const keyframes = (seed: string) =>
  `2 + (((instr('${BASE64URL}', substr(${seed}, 2, 1)) - 1) >> 1) & 7)`;
/** A view's steps, at least three and at least the palette's keyframes, as the gallery keeps them. */
const steps = (value: string, seed: string) => `MAX(3, ${value}, ${keyframes(seed)})`;

/** Old ids to seeds: the migrated gallery's map wins where both name an id. */
export function readAliases(dir = resolve(WEB, "data")): Map<string, string> {
  const read = (file: string) =>
    JSON.parse(readFileSync(resolve(dir, file), "utf8")) as Record<string, string>;
  return new Map(Object.entries({ ...read("legacy-links.json"), ...read("legacy-k.json") }));
}

export interface Original {
  kseed: string;
  createdAt: number;
  legacy?: string;
  style?: string;
  steps?: number;
  angle?: number;
}

/** The first Grabient's gradients: each takes the date it was made, and those grabient.com never held join the gallery
    in the view given. */
export function readOriginals(dir = resolve(WEB, "data")): Original[] {
  const { items } = JSON.parse(readFileSync(resolve(dir, "original-gradients.json"), "utf8")) as {
    items: Original[];
  };
  for (const item of items) {
    const viewed =
      item.legacy ||
      (STYLES.includes(item.style ?? "") &&
        Number.isInteger(item.steps) &&
        Number.isInteger(item.angle));
    if (!/^k[\w-]+$/.test(item.kseed) || !(item.createdAt > 0) || !viewed) {
      throw new Error(`data/original-gradients.json: ${item.kseed} has no seed, date or view`);
    }
  }
  return items;
}

/** The production palettes no map gives a seed: they need fitting into data/legacy-links.json first. */
export const unmapped = (palettes: readonly Row[], aliases: ReadonlyMap<string, string>) =>
  palettes.filter(palette => !aliases.has(String(palette.id)));

/** The import, in order. */
export function importStatements(
  aliases: ReadonlyMap<string, string>,
  originals: readonly Original[]
): string[] {
  const viewed = originals.filter(original => !original.legacy);
  const dates = Map.groupBy(originals, original => original.createdAt);
  return [
    /* the map the statements below join through: an old id that has a seed keeps it */
    ...chunks([...aliases], 300).map(
      part =>
        `INSERT INTO k_legacy_map (legacy_seed, kseed) VALUES ${part
          .map(([old, seed]) => `(${literal(old)}, ${literal(seed)})`)
          .join(", ")} ON CONFLICT(legacy_seed) DO NOTHING`
    ),
    /* every production palette at its seed, in production's view and time; of two ids on one seed the older names it */
    `INSERT INTO k_palettes (seed, style, steps, angle, created_at)
SELECT m.kseed, p.style, ${steps("p.steps", "m.kseed")}, p.angle, p.created_at
FROM palettes p JOIN k_legacy_map m ON m.legacy_seed = p.id
WHERE p.style IN (${STYLES.map(literal).join(", ")}) AND p.id = (
  SELECT q.id FROM palettes q JOIN k_legacy_map n ON n.legacy_seed = q.id
  WHERE n.kseed = m.kseed ORDER BY q.created_at, q.id LIMIT 1)
ON CONFLICT(seed) DO UPDATE SET style = excluded.style, steps = excluded.steps, angle = excluded.angle,
  created_at = excluded.created_at`,
    ...viewed.map(
      original =>
        `INSERT INTO k_palettes (seed, style, steps, angle, created_at) VALUES (${[
          original.kseed,
          original.style!,
          original.steps!,
          original.angle!,
          original.createdAt
        ]
          .map(literal)
          .join(", ")}) ON CONFLICT(seed) DO NOTHING`
    ),
    /* only ever back: running it again changes nothing */
    ...[...dates].map(
      ([at, items]) =>
        `UPDATE k_palettes SET created_at = ${at} WHERE created_at > ${at} AND seed IN (${items
          .map(item => literal(item.kseed))
          .join(", ")})`
    ),
    /* an account's likes become its saved palettes; of one account's likes under two ids of one seed the newest stays */
    `INSERT OR IGNORE INTO k_likes (user_id, palette_id, steps, style, angle, created_at)
SELECT l.user_id, m.kseed, ${steps("l.steps", "m.kseed")}, l.style, l.angle, l.created_at
FROM likes l JOIN k_legacy_map m ON m.legacy_seed = l.palette_id JOIN auth_user u ON u.id = l.user_id
WHERE l.style IN (${STYLES.map(literal).join(", ")})
ORDER BY l.created_at DESC, l.palette_id`
  ];
}

/** The counts the import and anything added after it leave to be made whole: likes of deleted accounts count as
    history, and every palette's count is that history and its likes. */
export const likeCountStatements = () => [
  `WITH history AS (
  SELECT m.kseed, COUNT(DISTINCT l.user_id) AS total
  FROM likes l JOIN k_legacy_map m ON m.legacy_seed = l.palette_id LEFT JOIN auth_user u ON u.id = l.user_id
  WHERE u.id IS NULL GROUP BY m.kseed)
UPDATE k_palettes SET legacy_likes_count = COALESCE((SELECT total FROM history WHERE history.kseed = k_palettes.seed), 0)
WHERE legacy_likes_count <> COALESCE((SELECT total FROM history WHERE history.kseed = k_palettes.seed), 0)`,
  `UPDATE k_palettes SET likes_count = legacy_likes_count + (SELECT COUNT(*) FROM k_likes WHERE palette_id = k_palettes.seed)
WHERE likes_count <> legacy_likes_count + (SELECT COUNT(*) FROM k_likes WHERE palette_id = k_palettes.seed)`
];
