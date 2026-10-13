import { decodePalette, encodePalette } from "@grabient/engine";
import { STEPS_MIN, STYLES, type Style } from "@grabient/engine/view.ts";
import { accountRole } from "@grabient/server/auth/roles.ts";
import { all, batch, first, replica, type Statement } from "@grabient/server/db/d1.ts";
import type { Env } from "@grabient/server/env.ts";
import type { LimitCheck } from "@grabient/server/limits/check.ts";
import * as v from "valibot";
import type { PaletteItem, SavedPage } from "../../features/gallery/schema.ts";
import { listWords } from "../../lib/words.ts";
import { forgetGalleryCount, itemsOf, LIMIT_MAX, type PaletteRow } from "./palettes.ts";
import {
  collectionsRisingLiked,
  collectionsRisingUnliked,
  NEW_WEIGHT,
  risingLiked,
  risingUnliked
} from "./scores.ts";
import { paletteJoined, searchOwn } from "./seams.ts";

/* An account's like of a palette, as the server applies it. The like is the account's own, an admin's too. A palette's
   first like adds it to the gallery, dated by when the site first held it, unless an admin deleted it; the like is
   saved either way. The hot and rising scores move in the like's own batch. Likes are desired states: a save sent
   twice, or saved by two tabs at once, writes one like and moves the scores once, and an unsave sent twice takes one
   like off. The callers (the account's sync, an app's save) have checked who asks and counted likeLimits first. */

/** Saved never counts or pages past an account's latest thousand likes; a search reads its latest two thousand. */
export const SAVED_PAGED = 1000;
export const SAVED_SEARCHED = 2000;
/** An undo puts a like back at the time it was made, which is past and no earlier than this. */
const LIKES_BEGAN = Date.UTC(2015, 0, 1);
const TITLE_MAX = 80;

const canonicalSeed = (raw: unknown): string | null => {
  if (typeof raw !== "string" || raw.length > 240) return null;
  const palette = decodePalette(raw);
  return palette ? encodePalette(palette) : null;
};

/** A like's own label for its palette, one line of 1 to 80 characters; null for anything else. */
export function likeTitle(value: unknown): string | null {
  if (typeof value !== "string" || value.length > TITLE_MAX * 4) return null;
  const clean = value
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters become spaces
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return clean && clean.length <= TITLE_MAX ? clean : null;
}

/** What a like's request says: a palette, yes or no, and the view it is saved in. */
const LikeBody = v.object({
  seed: v.string(),
  liked: v.boolean(),
  style: v.picklist(STYLES),
  steps: v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(100)),
  angle: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(360)),
  /** an undo's: when the like it puts back was made */
  at: v.optional(v.unknown()),
  title: v.optional(v.unknown()),
  /** where an admin pressed: the search it answered, or the collection whose page showed it */
  from: v.optional(v.object({ q: v.optional(v.string()), collection: v.optional(v.string()) }))
});

export type LikeVia = "mcp" | "production";
export interface LikeInput {
  seed: string;
  liked: boolean;
  style: Style;
  steps: number;
  angle: number;
  at?: number;
  /** the account's own label: an app's save gives it, and an undo puts back the one an unsave took */
  title?: string;
  /** an admin's press: the words of the search it answered (as lists write them) and the collection's slug */
  from?: { q?: string; collection?: string };
  via?: LikeVia;
  /** the view the site already shows the palette in (a public collection's): it joins the gallery in that one */
  shown?: { style: Style; steps: number; angle: number };
}

/** A like's request read and checked, its seed canonical; null when it is no like. */
export function likeInput(body: unknown): LikeInput | null {
  const parsed = v.safeParse(LikeBody, body);
  if (!parsed.success) return null;
  const { at, title, ...like } = parsed.output;
  const seed = canonicalSeed(like.seed);
  if (!seed) return null;
  const restored = Number.isInteger(at) ? (at as number) : undefined;
  const named = like.liked && restored !== undefined ? likeTitle(title) : null;
  return {
    ...like,
    seed,
    ...(restored !== undefined ? { at: restored } : {}),
    ...(named ? { title: named } : {})
  };
}

/** A like's allowances: the account's minute and day, then the site's day of hearts, or for an app's save the apps'
    own day, so a flood of saves through apps stops theirs and never the hearts. */
export const likeLimits = (userId: string, via?: LikeVia): LimitCheck[] => [
  [`user:${userId}`, ["toggleLike", "toggleLikeDaily"]],
  via === "mcp" ? ["mcp-likes", "mcpLikesDaily"] : ["likes", "likesDaily"]
];
/** What an app's save of a palette new to the site counts against as well: the account's day of palettes its apps
    add to the public gallery. */
export const publishLimits = (userId: string): LimitCheck[] => [
  [`user:${userId}`, "mcpPublishDaily"]
];

export type LikeChange = "new" | "already saved" | "removed" | "was not saved";
interface KeptLike {
  at: number;
  style: string;
  steps: number;
  angle: number;
  title?: string;
}
export interface LikeOutcome {
  liked: boolean;
  key: string;
  /** null when the count could not be read after the like was written */
  likesCount: number | null;
  /** this save added the palette to the gallery */
  joined: boolean;
  /** whether the gallery holds the palette afterwards; null when that could not be read */
  inGallery: boolean | null;
  change: LikeChange;
  /** the view the like is kept in: a palette saved before keeps the one it was first saved in */
  style?: string;
  steps?: number;
  angle?: number;
  /** when the like was made, for an undo to send back */
  at?: number;
  /** the like an unsave took, for an undo to put back */
  was?: KeptLike | null;
}

const LIKED = "EXISTS (SELECT 1 FROM k_likes WHERE user_id = ? AND palette_id = ?)";
/** When the site first held a palette: the first time a collection did, or now. Bound as (now, seed, now). */
const FIRST_HELD = `COALESCE(MIN(?, (SELECT MIN(COALESCE(j.created_at, jc.created_at)) FROM k_collection_items j
  JOIN k_collections jc ON jc.id = j.collection_id WHERE j.seed = ?)), ?)`;

async function likeContext(env: Pick<Env, "DB">, from: LikeInput["from"]) {
  const query = listWords(from?.q) || null;
  const slug = from?.collection;
  const found = slug
    ? await first<{ id: string }>(env.DB, "SELECT id FROM k_collections WHERE slug = ?", slug)
    : null;
  return { query, collectionId: found?.id ?? null };
}

async function save(
  env: Pick<Env, "DB">,
  account: { id: string; role?: string | null },
  input: LikeInput,
  now: number
) {
  const { seed } = input;
  const user = account.id;
  const palette = decodePalette(seed)!;
  const steps = Math.max(STEPS_MIN, palette.anchors.length, input.steps);
  const admin =
    (account.role === undefined ? await accountRole(env, user) : account.role) === "admin";
  const context = admin ? await likeContext(env, input.from) : { query: null, collectionId: null };
  const known = await first<{ held: number; deleted: number; saved: number }>(
    env.DB,
    `SELECT EXISTS (SELECT 1 FROM k_palettes WHERE seed = ?) AS held,
       EXISTS (SELECT 1 FROM k_admin_actions WHERE seed = ? AND action = 'delete') AS deleted,
       ${LIKED} AS saved`,
    seed,
    seed,
    user,
    seed
  );
  const publish = !known?.held && !known?.deleted;
  const madeAt =
    input.at !== undefined && input.at >= LIKES_BEGAN && input.at <= now ? input.at : now;
  const shown = input.shown ?? { style: input.style, steps, angle: input.angle };
  /* a like saved again keeps its time and view; a title sent with it renames it, so the sync's log hears a rename and
     no other repeated save. An undo's title comes back only with the like it makes again */
  const onHeld =
    input.at === undefined
      ? "UPDATE SET title = excluded.title WHERE excluded.title IS NOT NULL AND k_likes.title IS NOT excluded.title"
      : "NOTHING";
  const statements: Statement[] = [
    ...(publish
      ? ([
          [
            `INSERT INTO k_palettes (seed, style, steps, angle, created_at, hot)
             SELECT ?, ?, ?, ?, ${FIRST_HELD}, ?
             WHERE NOT EXISTS (SELECT 1 FROM k_admin_actions WHERE seed = ? AND action = 'delete')
             ON CONFLICT (seed) DO NOTHING`,
            seed,
            shown.style,
            shown.steps,
            shown.angle,
            now,
            seed,
            now,
            NEW_WEIGHT,
            seed
          ],
          /* it counts the likes saved while it stayed out of the gallery */
          [
            `UPDATE k_palettes SET likes_count = legacy_likes_count + (SELECT COUNT(*) FROM k_likes WHERE palette_id = ?)
             WHERE seed = ? AND likes_count <> legacy_likes_count + (SELECT COUNT(*) FROM k_likes WHERE palette_id = ?)`,
            seed,
            seed,
            seed
          ]
        ] satisfies Statement[])
      : []),
    [
      `UPDATE k_palettes SET hot = hot + 1, ${risingLiked(madeAt)} WHERE seed = ? AND NOT ${LIKED}`,
      seed,
      user,
      seed
    ],
    [`${collectionsRisingLiked(madeAt)} AND NOT ${LIKED}`, seed, user, seed],
    [
      `INSERT INTO k_likes (user_id, palette_id, steps, style, angle, created_at, query, collection_id, via, title)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, palette_id) DO ${onHeld}`,
      user,
      seed,
      steps,
      input.style,
      input.angle,
      madeAt,
      context.query,
      context.collectionId,
      admin ? (input.via ?? null) : null,
      input.title ?? null
    ],
    [
      "SELECT created_at AS at, style, steps, angle FROM k_likes WHERE user_id = ? AND palette_id = ?",
      user,
      seed
    ]
  ];
  const results = await batch(env.DB, statements);
  const held = results.at(-1)?.results?.[0] as Partial<KeptLike> | undefined;
  const joined = publish && Number(results[0]?.meta?.changes) > 0;
  const change: LikeChange = known?.saved ? "already saved" : "new";
  return {
    joined,
    change,
    at: Number(held?.at) || madeAt,
    style: held?.style ?? input.style,
    steps: Number(held?.steps ?? steps),
    angle: Number(held?.angle ?? input.angle)
  };
}

async function unsave(env: Pick<Env, "DB">, user: string, seed: string): Promise<KeptLike | null> {
  /* read first: its weight comes off the rising scores as a like of the time it was made */
  const row = await first<KeptLike & { title: string | null }>(
    env.DB,
    "SELECT created_at AS at, style, steps, angle, title FROM k_likes WHERE user_id = ? AND palette_id = ?",
    user,
    seed
  );
  if (!row) return null;
  const at = Number(row.at);
  await batch(env.DB, [
    [
      `UPDATE k_palettes SET hot = MAX(0, hot - 1), ${risingUnliked(at)} WHERE seed = ? AND ${LIKED}`,
      seed,
      user,
      seed
    ],
    [`${collectionsRisingUnliked(at)} AND ${LIKED}`, seed, user, seed],
    ["DELETE FROM k_likes WHERE user_id = ? AND palette_id = ?", user, seed]
  ]);
  const { title, ...like } = row;
  return {
    ...like,
    at,
    steps: Number(like.steps),
    angle: Number(like.angle),
    ...(title ? { title } : {})
  };
}

/** One account's like of one palette, set or taken back. */
export async function setLike(
  env: Env,
  account: { id: string; role?: string | null },
  input: LikeInput
): Promise<LikeOutcome> {
  const now = Date.now();
  let outcome: Omit<LikeOutcome, "likesCount" | "inGallery">;
  if (input.liked) {
    const { joined, change, ...kept } = await save(env, account, input, now);
    if (joined) {
      forgetGalleryCount();
      paletteJoined(env, input.seed);
    }
    outcome = { liked: true, key: input.seed, joined, change, ...kept };
  } else {
    const was = await unsave(env, account.id, input.seed);
    outcome = {
      liked: false,
      key: input.seed,
      joined: false,
      change: was ? "removed" : "was not saved",
      ...(was ? { style: was.style, steps: was.steps, angle: was.angle } : {}),
      was
    };
  }
  /* the like has committed: a count that cannot be read now never tells the reader to undo it */
  try {
    const row = await first<{ n: number }>(
      env.DB,
      "SELECT likes_count AS n FROM k_palettes WHERE seed = ?",
      input.seed
    );
    return { ...outcome, likesCount: Number(row?.n ?? 0), inGallery: !!row };
  } catch {
    return { ...outcome, likesCount: null, inGallery: null };
  }
}

/** The like counts of these palettes, at most 96, by canonical seed: 0 for a palette the gallery does not hold. */
export async function likeCounts(
  env: Pick<Env, "DB">,
  keys: readonly string[]
): Promise<Record<string, number>> {
  const seeds = [...new Set(keys.flatMap(key => canonicalSeed(key) ?? []))].slice(0, LIMIT_MAX);
  const counts: Record<string, number> = Object.fromEntries(seeds.map(seed => [seed, 0]));
  if (!seeds.length) return counts;
  const rows = await all<{ seed: string; n: number }>(
    replica(env),
    `SELECT seed, likes_count AS n FROM k_palettes WHERE seed IN (${seeds.map(() => "?").join(",")})`,
    ...seeds
  );
  for (const row of rows) counts[row.seed] = Number(row.n);
  return counts;
}

const SAVED = `SELECT own.palette_id AS seed, own.style, own.steps, own.angle, own.created_at,
  COALESCE(palette.likes_count, 0) AS likes_count
  FROM k_likes own LEFT JOIN k_palettes palette ON palette.seed = own.palette_id
  WHERE own.user_id = ? ORDER BY own.created_at DESC, own.palette_id`;

/** An account's latest likes, newest first: each palette drawn as it was saved and dated by its like. */
export async function savedLikes(
  env: Pick<Env, "DB">,
  user: string,
  limit: number,
  offset = 0
): Promise<PaletteItem[]> {
  return itemsOf(await all<PaletteRow>(env.DB, `${SAVED} LIMIT ? OFFSET ?`, user, limit, offset));
}

/** How many palettes an account has saved, as Saved counts them: never past SAVED_PAGED. */
export async function savedCount(env: Pick<Env, "DB">, user: string): Promise<number> {
  const row = await first<{ n: number }>(
    env.DB,
    "SELECT COUNT(*) AS n FROM (SELECT 1 FROM k_likes WHERE user_id = ? LIMIT ?)",
    user,
    SAVED_PAGED
  );
  return Number(row?.n ?? 0);
}

/** A page of an account's Saved list: its latest likes, or searched, the ones of its latest two thousand that answer
    the words, best first. */
export async function savedPage(
  env: Env,
  request: Request,
  user: string,
  input: { page: number; limit: number; words: string }
): Promise<SavedPage> {
  const { page, limit, words } = input;
  const at = (page - 1) * limit;
  if (words) {
    const own = new Map(
      (await savedLikes(env, user, SAVED_SEARCHED)).map(item => [item.kseed, item])
    );
    const { tier, found } = await searchOwn(env, words, [...own.keys()], request);
    return {
      items: found.slice(at, at + limit).flatMap(hit => own.get(hit.seed) ?? []),
      total: found.length,
      page,
      totalPages: Math.max(1, Math.ceil(found.length / limit)),
      query: words,
      tier,
      fetchedAt: Date.now()
    };
  }
  const total = await savedCount(env, user);
  return {
    items: at >= total ? [] : await savedLikes(env, user, Math.min(limit, total - at), at),
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    fetchedAt: Date.now()
  };
}
