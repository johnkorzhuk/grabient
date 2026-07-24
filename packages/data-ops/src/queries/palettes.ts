import { eq, desc, asc, sql, count, inArray } from "drizzle-orm";
import { getDb } from "../database/setup";
import { palettes, likes, type Palette, type Like } from "../drizzle/app-schema";
import { deserializeCoeffs, paletteCoeffKey } from "../serialization";
import { cosineGradient, rgbToHex, applyGlobals, type CosineCoeffs, type GlobalModifiers } from "../gradient-gen/cosine";


export async function getPaletteBySeed(seed: string): Promise<Palette | undefined> {
  const db = getDb();
  const result = await db.select().from(palettes).where(eq(palettes.id, seed)).limit(1);
  return result[0];
}


export async function getPopularPalettes(limit = 20): Promise<(Palette & { likesCount: number })[]> {
  const db = getDb();
  const likesCountSql = sql<number>`COUNT(DISTINCT ${likes.userId})`;
  const result = await db
    .select({
      id: palettes.id,
      style: palettes.style,
      steps: palettes.steps,
      angle: palettes.angle,
      createdAt: palettes.createdAt,
      likesCount: likesCountSql,
    })
    .from(palettes)
    .leftJoin(likes, eq(palettes.id, likes.paletteId))
    .groupBy(palettes.id)
    .orderBy(desc(likesCountSql))
    .limit(limit);

  return withKeyCounts(result, (r) => r.id, db);
}


export async function getPopularPalettesPaginated(
  page = 1,
  limit = 24,
  dbInstance?: ReturnType<typeof getDb>
): Promise<{ palettes: (Palette & { likesCount: number })[]; total: number }> {
  const db = dbInstance || getDb();
  const offset = (page - 1) * limit;
  const likesCountSql = sql<number>`COUNT(DISTINCT ${likes.userId})`;

  const [palettesResult, countResult] = await Promise.all([
    db
      .select({
        id: palettes.id,
        style: palettes.style,
        steps: palettes.steps,
        angle: palettes.angle,
        createdAt: palettes.createdAt,
        likesCount: likesCountSql,
      })
      .from(palettes)
      .leftJoin(likes, eq(palettes.id, likes.paletteId))
      .groupBy(palettes.id)
      .orderBy(desc(likesCountSql))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(palettes),
  ]);

  return {
    palettes: await withKeyCounts(palettesResult, (r) => r.id, db),
    total: countResult[0]?.count || 0,
  };
}


export async function getPalettesPaginatedByDate(
  page = 1,
  limit = 24,
  order: "newest" | "oldest" = "newest",
  dbInstance?: ReturnType<typeof getDb>
): Promise<{ palettes: (Palette & { likesCount: number })[]; total: number }> {
  const db = dbInstance || getDb();
  const offset = (page - 1) * limit;
  const likesCountSql = sql<number>`COUNT(DISTINCT ${likes.userId})`;
  const orderFn = order === "newest" ? desc : asc;

  const [palettesResult, countResult] = await Promise.all([
    db
      .select({
        id: palettes.id,
        style: palettes.style,
        steps: palettes.steps,
        angle: palettes.angle,
        createdAt: palettes.createdAt,
        likesCount: likesCountSql,
      })
      .from(palettes)
      .leftJoin(likes, eq(palettes.id, likes.paletteId))
      .groupBy(palettes.id)
      .orderBy(orderFn(palettes.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ count: sql<number>`count(*)` }).from(palettes),
  ]);

  return {
    palettes: await withKeyCounts(palettesResult, (r) => r.id, db),
    total: countResult[0]?.count || 0,
  };
}


export async function getPopularPalettesPage(
  page = 1,
  limit = 24,
  dbInstance?: ReturnType<typeof getDb>
): Promise<(Palette & { likesCount: number })[]> {
  const db = dbInstance || getDb();
  const likesCountSql = sql<number>`COUNT(DISTINCT ${likes.userId})`;
  const rows = await db
    .select({
      id: palettes.id,
      style: palettes.style,
      steps: palettes.steps,
      angle: palettes.angle,
      createdAt: palettes.createdAt,
      likesCount: likesCountSql,
    })
    .from(palettes)
    .leftJoin(likes, eq(palettes.id, likes.paletteId))
    .groupBy(palettes.id)
    .orderBy(desc(likesCountSql))
    .limit(limit)
    .offset((page - 1) * limit);
  return withKeyCounts(rows, (r) => r.id, db);
}


export async function getPalettesPageByDate(
  page = 1,
  limit = 24,
  order: "newest" | "oldest" = "newest",
  dbInstance?: ReturnType<typeof getDb>
): Promise<(Palette & { likesCount: number })[]> {
  const db = dbInstance || getDb();
  const likesCountSql = sql<number>`COUNT(DISTINCT ${likes.userId})`;
  const orderFn = order === "newest" ? desc : asc;
  const rows = await db
    .select({
      id: palettes.id,
      style: palettes.style,
      steps: palettes.steps,
      angle: palettes.angle,
      createdAt: palettes.createdAt,
      likesCount: likesCountSql,
    })
    .from(palettes)
    .leftJoin(likes, eq(palettes.id, likes.paletteId))
    .groupBy(palettes.id)
    .orderBy(orderFn(palettes.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);
  return withKeyCounts(rows, (r) => r.id, db);
}


export async function getRecentPalettes(limit = 20): Promise<Palette[]> {
  const db = getDb();
  return await db.select().from(palettes).orderBy(desc(palettes.createdAt)).limit(limit);
}


export async function getUserLikes(userId: string, limit = 50): Promise<Like[]> {
  const db = getDb();
  return await db.select().from(likes).where(eq(likes.userId, userId)).orderBy(desc(likes.createdAt)).limit(limit);
}

/**
 * Get a user's liked palettes with like counts for each paletteId.
 * Counts are cross-alias key totals (see withKeyCounts).
 */
export async function getUserLikesWithCounts(
  userId: string,
  limit = 50,
  dbInstance?: ReturnType<typeof getDb>
): Promise<(Like & { likesCount: number })[]> {
  const db = dbInstance || getDb();

  const result = await db
    .select({
      userId: likes.userId,
      paletteId: likes.paletteId,
      steps: likes.steps,
      style: likes.style,
      angle: likes.angle,
      createdAt: likes.createdAt,
      likesCount: sql<number>`0`,
    })
    .from(likes)
    .where(eq(likes.userId, userId))
    .orderBy(desc(likes.createdAt))
    .limit(limit);

  return withKeyCounts(result, (r) => r.paletteId, db);
}

export async function getUserLikedSeeds(userId: string, dbInstance?: ReturnType<typeof getDb>): Promise<string[]> {
  const db = dbInstance || getDb();
  const result = await db
    .select({ paletteId: likes.paletteId })
    .from(likes)
    .where(eq(likes.userId, userId));
  return result.map(r => r.paletteId);
}

/**
 * Cross-alias like totals. One palette exists under MANY stored seed strings
 * (legacy ids embed view params; v3 ids embed non-default globals), so counting
 * likes per exact palette_id splits one palette's total across its aliases —
 * and any count taken under the canonical id alone reads ~0 for palettes whose
 * likes predate v3. Identity is the coefficient key (paletteCoeffKey); the
 * likes table is small (~1k rows), so aggregate it in JS: key → distinct
 * users. Pure helper, unit-tested in apps/web.
 */
export function aggregateLikesByKey(
  rows: { paletteId: string; userId: string }[]
): Map<string, Set<string>> {
  const byKey = new Map<string, Set<string>>();
  for (const r of rows) {
    const key = paletteCoeffKey(r.paletteId) ?? r.paletteId;
    let users = byKey.get(key);
    if (!users) {
      users = new Set();
      byKey.set(key, users);
    }
    users.add(r.userId);
  }
  return byKey;
}

// Always read the durable aggregate rather than memoizing it per isolate.
// A toggle can write through one Worker isolate while the next page/count
// request lands on another isolate, so counts must read the durable rows.
export async function getLikesKeyTotals(
  dbInstance?: ReturnType<typeof getDb>
): Promise<Map<string, Set<string>>> {
  const db = dbInstance || getDb();
  const rows = await db
    .select({ paletteId: likes.paletteId, userId: likes.userId })
    .from(likes);
  return aggregateLikesByKey(rows);
}

export async function getLikesCountByKey(
  seed: string,
  dbInstance?: ReturnType<typeof getDb>
): Promise<number> {
  const key = paletteCoeffKey(seed) ?? seed;
  const totals = await getLikesKeyTotals(dbInstance);
  return totals.get(key)?.size ?? 0;
}

export async function getLikesCountsByKeys(
  seeds: string[],
  dbInstance?: ReturnType<typeof getDb>
): Promise<Record<string, number>> {
  const totals = await getLikesKeyTotals(dbInstance);
  const counts: Record<string, number> = {};
  for (const seed of new Set(seeds)) {
    const key = paletteCoeffKey(seed) ?? seed;
    counts[key] = totals.get(key)?.size ?? 0;
  }
  return counts;
}

/**
 * Replace per-row SQL counts with cross-alias key totals so every surface
 * (list card, seed page, toggle response) shows the palette's true total.
 * Note: popular ORDER BY still ranks by the row-level SQL count — aliases of
 * one palette stay separate cards (matching the original site), only the
 * displayed number is unified.
 */
async function withKeyCounts<T extends { likesCount: number }>(
  rows: T[],
  getId: (r: T) => string,
  dbInstance?: ReturnType<typeof getDb>
): Promise<T[]> {
  if (!rows.length) return rows;
  const totals = await getLikesKeyTotals(dbInstance);
  return rows.map((r) => {
    const id = getId(r);
    const key = paletteCoeffKey(id) ?? id;
    return { ...r, likesCount: totals.get(key)?.size ?? 0 };
  });
}

export async function getPaletteLikeInfo(
  seed: string,
  userId?: string
): Promise<{ likesCount: number; isLiked: boolean }> {
  const key = paletteCoeffKey(seed) ?? seed;
  const totals = await getLikesKeyTotals();
  const users = totals.get(key);
  return {
    likesCount: users?.size ?? 0,
    isLiked: userId ? (users?.has(userId) ?? false) : false,
  };
}

export async function hasUserLiked(userId: string, seed: string): Promise<boolean> {
  const db = getDb();
  const result = await db
    .select()
    .from(likes)
    .where(sql`${likes.userId} = ${userId} AND ${likes.paletteId} = ${seed}`)
    .limit(1);
  return result.length > 0;
}

export async function getPublicLikes(limit = 50): Promise<Like[]> {
  const db = getDb();
  return await db
    .select()
    .from(likes)
    .orderBy(desc(likes.createdAt))
    .limit(limit);
}

export async function getPaletteById(id: string): Promise<Palette | undefined> {
  const db = getDb();
  const result = await db.select().from(palettes).where(eq(palettes.id, id)).limit(1);
  return result[0];
}


export async function getPalettesCount(): Promise<number> {
  const db = getDb();
  const result = await db.select({ count: sql<number>`count(*)` }).from(palettes);
  return result[0]?.count || 0;
}


export async function getLikesCount(): Promise<number> {
  const db = getDb();
  const result = await db.select({ count: sql<number>`count(*)` }).from(likes);
  return result[0]?.count || 0;
}

function isPaletteUniform(seed: string): boolean {
  try {
    const { coeffs, globals } = deserializeCoeffs(seed);
    const appliedCoeffs = applyGlobals(coeffs, globals);
    const rgbColors = cosineGradient(7, appliedCoeffs);

    if (rgbColors.length === 0) return false;

    const hexColors = rgbColors.map(([r, g, b]) => rgbToHex(r, g, b));
    const firstColor = hexColors[0];

    return hexColors.every(color => color === firstColor);
  } catch {
    return false;
  }
}

export async function toggleLikePalette(
  userId: string,
  seed: string,
  steps: number,
  style: Palette["style"],
  angle: number,
  dbInstance?: ReturnType<typeof getDb>
): Promise<{ success: true; liked: boolean; paletteId: string }> {
  const db = dbInstance || getDb();

  try {
    const existingLike = await db
      .select()
      .from(likes)
      .where(sql`${likes.userId} = ${userId} AND ${likes.paletteId} = ${seed}`)
      .limit(1);

    if (existingLike.length > 0 && existingLike[0]) {
      await db.delete(likes).where(sql`${likes.userId} = ${userId} AND ${likes.paletteId} = ${seed}`);
      return { success: true, liked: false, paletteId: seed };
    }

    const isUniform = isPaletteUniform(seed);

    if (!isUniform) {
      await db.insert(palettes).values({
        id: seed,
        steps,
        style,
        angle,
        createdAt: new Date(),
      }).onConflictDoNothing();
    }

    await db.insert(likes).values({
      paletteId: seed,
      userId,
      steps,
      style,
      angle,
      createdAt: new Date(),
    });

    return { success: true, liked: true, paletteId: seed };
  } catch (error) {
    console.error('[toggleLikePalette] ERROR:', error);
    console.error('[toggleLikePalette] Parameters:', { userId, seed, steps, style, angle });
    throw error;
  }
}

/**
 * Alias-aware variant of toggleLikePalette. One palette exists under MANY
 * stored seed strings: legacy ids embed the view params, v3 ids embed
 * non-default globals, and a like records whichever alias was current at
 * click time. Matching by exact id therefore misses (an "unlike" inserted a
 * duplicate instead of deleting — the count went UP). Identity here is the
 * coefficient key: unlike deletes EVERY like row this user has for the
 * palette (any alias); like inserts keyed by the seed as sent, so counts keep
 * joining the id the caller displays. Returns the coefficient key (client
 * hearts are keyed by it) and the palette's cross-alias distinct-user total
 * (the same total list cards and the seed page display).
 */
export async function toggleLikePaletteByKey(
  userId: string,
  seed: string,
  steps: number,
  style: Palette["style"],
  angle: number,
  dbInstance?: ReturnType<typeof getDb>
): Promise<{ success: true; liked: boolean; paletteId: string; key: string; likesCount: number }> {
  const db = dbInstance || getDb();
  const key = paletteCoeffKey(seed) ?? seed;

  try {
    const rows = await db
      .select({ paletteId: likes.paletteId })
      .from(likes)
      .where(eq(likes.userId, userId));
    const aliases = rows
      .map((r) => r.paletteId)
      .filter((id) => (paletteCoeffKey(id) ?? id) === key);

    let liked: boolean;
    if (aliases.length > 0) {
      await db
        .delete(likes)
        .where(sql`${likes.userId} = ${userId} AND ${inArray(likes.paletteId, aliases)}`);
      liked = false;
    } else {
      if (!isPaletteUniform(seed)) {
        await db.insert(palettes).values({
          id: seed,
          steps,
          style,
          angle,
          createdAt: new Date(),
        }).onConflictDoNothing();
      }
      await db.insert(likes).values({
        paletteId: seed,
        userId,
        steps,
        style,
        angle,
        createdAt: new Date(),
      });
      liked = true;
    }

    // The displayed count is the palette's cross-alias total (what list cards
    // and the seed page show), not the row-level count. Re-read the durable
    // rows so this response stays authoritative across Worker isolates.
    const likesCount = await getLikesCountByKey(seed, db);
    return { success: true, liked, paletteId: seed, key, likesCount };
  } catch (error) {
    console.error('[toggleLikePaletteByKey] ERROR:', error);
    console.error('[toggleLikePaletteByKey] Parameters:', { userId, seed, steps, style, angle });
    throw error;
  }
}
