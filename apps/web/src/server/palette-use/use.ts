import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { sampleLCH } from "@grabient/engine/curve.ts";
import { samples, structure } from "@grabient/engine/shape.ts";
import { drawnView } from "@grabient/engine/view.ts";
import { readJson, sameOrigin } from "@grabient/server/auth/http.ts";
import { batch, first, type Statement } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits, type LimitCheck } from "@grabient/server/limits/check.ts";
import * as v from "valibot";
import { NO_STORE } from "../../lib/cache.ts";
import { isCrawler } from "../crawlers.ts";
import { countedWords, type SearchPage } from "../search/counts.ts";
import { countAct } from "../visits/count.ts";

/* How readers use the site's public palettes, counted for seeding and read with the searches people make by the
   admins' tools. Likes need an account, and fit votes a press few make; what readers open, copy and download is the
   signal everyone gives.

   A page sends POST /api/used (features/palette-use), which always answers 204. A use is counted only for a palette
   the site shows publicly (the gallery or a public collection), with the kind of page it happened on, the public
   collection it was shown under, the search it answered in the words the vocabulary knows, its place in what showed
   it and the view it was taken in. A palette changed in the editor before it was taken counts as a use of the one that
   was opened, and the change is kept as numbers alone. Nothing names the reader: no address, account or cookie is
   written. Each address counts the same use once a day and at most 300 palettes an hour, and the site at most 50,000 a
   day; the `palette-use` flag turns the counting off. Rows go after 90 days. */

export const USE_ACTIONS = ["view", "open", "copy", "download"] as const;
export const USE_SURFACES = [
  "home",
  "list",
  "search",
  "saved",
  "collections",
  "collection",
  "selection",
  "editor"
] as const;
export type UseAction = (typeof USE_ACTIONS)[number];
export type UseSurface = (typeof USE_SURFACES)[number];

/** What a take is in: a strip's formats (md as a file saved), the swatch files, one color's hex, the editor's code
    blocks as code:<block> with the spelling copied, a file's address as link:<format>, and the editor's contrast sheet
    and color space as pictures. CSS and its address name the color spelling when Settings' is not OKLCH (css:hex). */
const FORMAT =
  /^(?:css(?::(?:hex|rgb|hsl))?|svg|png|jpeg|url|md|hex|ase|gpl|grd|tokens|code:[a-z]{2,12}(?::[a-z0-9]{2,12})?|link:css(?::(?:hex|rgb|hsl))?|link:(?:md|json|svg|png|ase|gpl|grd|tokens)|(?:contrast|space):(?:svg|png))$/;
const ITEMS_MAX = 50;
const POSITION_MAX = 999;
const DAY = 86_400_000;
/** how long a row is kept, as the privacy policy says */
export const KEEP_DAYS = 90;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** the search counts' page for each surface a search is made on */
const SEARCH_PAGE: Partial<Record<UseSurface, SearchPage>> = {
  search: "palettes",
  home: "home",
  collections: "collections"
};

const Seed = v.pipe(
  v.string(),
  v.maxLength(64),
  v.transform(seed => decodePalette(seed)),
  v.check(palette => palette !== null),
  v.transform(palette => encodePalette(palette!))
);
const Item = v.object({
  seed: Seed,
  style: v.optional(v.unknown()),
  steps: v.optional(v.unknown()),
  angle: v.optional(v.unknown()),
  position: v.optional(v.unknown())
});
const Body = v.object({
  action: v.picklist(USE_ACTIONS),
  surface: v.picklist(USE_SURFACES),
  format: v.optional(v.string(), ""),
  collection: v.optional(v.string(), ""),
  words: v.optional(v.pipe(v.string(), v.maxLength(400)), ""),
  searched: v.optional(v.boolean(), false),
  edited: v.optional(v.string()),
  items: v.optional(v.array(v.unknown()), [])
});

interface UseItem {
  seed: string;
  /** the view it was taken in, "linearGradient:7:90", or '' for an open */
  view: string;
  position: number;
}
export interface UseInput {
  action: UseAction;
  format: string;
  surface: UseSurface;
  items: UseItem[];
  collection: string;
  words: string;
  searched: boolean;
  /** the editor's palette as it was taken, when it changed from the one opened (items[0]) */
  edited: string | null;
}

/** The body as sent, checked: null when it is no use the site counts. Seeds are made canonical and views whole. */
export function useInput(body: unknown): UseInput | null {
  const read = v.safeParse(Body, body);
  if (!read.success) return null;
  const b = read.output;
  const take = b.action === "copy" || b.action === "download";
  if (take !== FORMAT.test(b.format)) return null;
  const collection = b.collection.length <= 80 && SLUG.test(b.collection) ? b.collection : "";
  if (b.action === "view") {
    return b.items.length || b.surface !== "collection" || !collection
      ? null
      : { ...b, format: "", items: [], collection, words: b.words.slice(0, 120), edited: null };
  }
  if (!b.items.length || b.items.length > ITEMS_MAX) return null;
  const items: UseItem[] = [];
  for (const entry of b.items) {
    const item = v.safeParse(Item, entry);
    if (!item.success || items.some(kept => kept.seed === item.output.seed)) continue;
    const { seed, style, steps, angle, position } = item.output;
    const view = drawnView(decodePalette(seed)!, {
      style: style as never,
      steps: typeof steps === "number" ? steps : undefined,
      angle: typeof angle === "number" ? angle : undefined
    });
    const at =
      Number.isInteger(position) &&
      (position as number) >= 0 &&
      (position as number) <= POSITION_MAX;
    items.push({
      seed,
      /* the view counts where a palette is taken; an open is a press on the card, whatever it showed */
      view: take ? `${view.style}:${view.steps}:${view.angle}` : "",
      position: at ? (position as number) : -1
    });
  }
  if (!items.length) return null;
  const edited =
    b.surface === "editor" && items.length === 1 && b.edited ? v.safeParse(Seed, b.edited) : null;
  return {
    action: b.action,
    format: take ? b.format : "",
    surface: b.surface,
    items,
    collection,
    words: b.words.slice(0, 120),
    searched: b.searched,
    edited: edited?.success && edited.output !== items[0].seed ? edited.output : null
  };
}

/** Of these seeds, the ones the site shows publicly: in the gallery, or in a public collection. */
async function publicSeeds(env: Pick<Env, "DB">, seeds: readonly string[]): Promise<Set<string>> {
  const marks = seeds.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT seed FROM k_palettes WHERE seed IN (${marks})
     UNION SELECT i.seed FROM k_collection_items i JOIN k_collections c ON c.id = i.collection_id
     WHERE c.visibility = 'public' AND i.seed IN (${marks})`
  )
    .bind(...seeds, ...seeds)
    .all<{ seed: string }>();
  return new Set(results.map(row => row.seed));
}
const publicCollection = async (env: Pick<Env, "DB">, slug: string) =>
  !!(await first(
    env.DB,
    "SELECT 1 AS found FROM k_collections WHERE slug = ? AND visibility = 'public'",
    slug
  ));

const round = (value: number, digits = 4) => +value.toFixed(digits);
/** The numbers a palette is judged by: its keyframes, how light and how far its lightness runs, how vivid, and the
    span of its visible hues. */
export function paletteNumbers(seed: string) {
  const P = decodePalette(seed);
  if (!P) return null;
  const shape = structure(samples(P));
  const along = Array.from({ length: 24 }, (_, i) => sampleLCH(P, i / 23));
  const lightness = along.map(([l]) => l);
  const hues = along.filter(([, c]) => c >= 0.05).map(([, , h]) => h);
  return {
    anchors: P.anchors.length,
    meanL: round(shape.meanL, 3),
    rangeL: round(Math.max(...lightness) - Math.min(...lightness), 3),
    meanC: round(shape.meanC, 3),
    maxC: round(shape.maxC, 3),
    hueSpan: hues.length ? Math.round(Math.max(...hues) - Math.min(...hues)) : 0
  };
}

/** POST /api/used: a palette a reader used, counted. Always 204: the page never waits on it. */
export async function usedResponse(request: Request, env: Env): Promise<Response> {
  const done = () => new Response(null, { status: 204, headers: NO_STORE });
  if (!sameOrigin(request) || isCrawler(request)) return done();
  if (await flagOff(env, "palette-use")) return done();
  const input = useInput(await readJson(request, 4096));
  if (!input) return done();
  const address = clientAddress(request) ?? "local";
  /* a limiter that cannot answer counts nothing */
  const allowed = async (checks: readonly LimitCheck[]) =>
    (await checkLimits(env, checks))?.success === true;
  if (!(await allowed([[`use:${address}`, "paletteUse", Math.max(1, input.items.length)]])))
    return done();
  /* the reader used a palette, or a collection's page once present: a visit of its own, which says how many of a
     day's visitors use the site */
  await countAct(env, request, "use");

  /* where it happened: a public collection, and a search in the words the vocabulary knows; anything else is left out */
  const collection =
    input.collection && (await publicCollection(env, input.collection).catch(() => false))
      ? input.collection
      : "";
  if (input.surface === "collection" && !collection) return done();
  const page = SEARCH_PAGE[input.surface];
  const words =
    page && input.words
      ? ((await countedWords(env, page, input.words).catch(() => null)) ?? "")
      : "";
  const shown = input.items.length
    ? await publicSeeds(
        env,
        input.items.map(item => item.seed)
      ).catch(() => new Set<string>())
    : new Set<string>();
  const items = input.items.filter(item => shown.has(item.seed));
  if (input.action !== "view" && !items.length) return done();

  /* each address counts the same use once a day: a palette and what was done with it, or a collection's page seen */
  const once = (key: string) => allowed([[`use:${address}:${key}`, "paletteUseOnce"]]);
  const kept: UseItem[] = [];
  if (input.action === "view") {
    if (!(await once(`view:${collection}`))) return done();
  } else {
    for (const item of items)
      if (await once(`${input.action}:${input.format}:${item.seed}`)) kept.push(item);
  }
  const count = input.action === "view" ? 1 : kept.length;
  if (!count || !(await allowed([["palette-use", "paletteUseDaily", count]]))) return done();

  const day = Math.floor(Date.now() / DAY);
  const WRITE = `INSERT INTO k_palette_use (day, seed, action, format, surface, collection, words, position, view, count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT (day, seed, action, format, surface, collection, words, position, view) DO UPDATE SET count = count + 1`;
  const statements: Statement[] =
    input.action === "view"
      ? [[WRITE, day, "", "view", "", "collection", collection, "", -1, ""]]
      : kept.map(item => [
          WRITE,
          day,
          item.seed,
          input.action,
          input.format,
          input.surface,
          collection,
          words,
          item.position,
          item.view
        ]);
  /* a counted search answered: once per address, page and words a day, on a day the search was counted */
  if (page && words && input.searched && kept.length && (await once(`searched:${page}:${words}`))) {
    statements.push([
      "UPDATE k_search_counts SET used = used + 1 WHERE day = ? AND page = ? AND words = ?",
      day,
      page,
      words
    ]);
  }
  /* the editor's change, as numbers: the palette that was taken is not kept */
  if (input.edited && kept.length && (await once(`edit:${kept[0].seed}`))) {
    const from = paletteNumbers(kept[0].seed);
    const to = paletteNumbers(input.edited);
    if (from && to) {
      statements.push([
        `INSERT INTO k_palette_edits (day, seed, collection, anchors, mean_l, range_l, mean_c, max_c, hue_span)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        day,
        kept[0].seed,
        collection,
        to.anchors - from.anchors,
        round(to.meanL - from.meanL),
        round(to.rangeL - from.rangeL),
        round(to.meanC - from.meanC),
        round(to.maxC - from.maxC),
        to.hueSpan - from.hueSpan
      ]);
    }
  }
  await batch(env.DB, statements).catch(error =>
    console.error("used: the count failed", error instanceof Error ? error.message : error)
  );
  return done();
}

/** The six-hour job's step: each day's uses and edits deleted once the day began 90 days ago. */
export async function prunePaletteUse(env: Pick<Env, "DB">, now = Date.now()): Promise<number> {
  const before = Math.floor(now / DAY) - KEEP_DAYS;
  const [uses, edits] = await batch(env.DB, [
    ["DELETE FROM k_palette_use WHERE day <= ?", before],
    ["DELETE FROM k_palette_edits WHERE day <= ?", before]
  ]);
  return (Number(uses?.meta?.changes) || 0) + (Number(edits?.meta?.changes) || 0);
}
