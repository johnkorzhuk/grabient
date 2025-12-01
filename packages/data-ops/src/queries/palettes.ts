import { eq, desc, sql, count, inArray } from "drizzle-orm";
import { getDb } from "../database/setup";
import { palettes, likes, type Palette, type Like } from "../drizzle/app-schema";
import { deserializeCoeffs } from "../serialization";
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

  return result;
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
    palettes: palettesResult,
    total: countResult[0]?.count || 0,
  };
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
      likesCount: sql<number>`(
        SELECT COUNT(DISTINCT user_id)
        FROM likes AS l2
        WHERE l2.palette_id = likes.palette_id
      )`,
    })
    .from(likes)
    .where(eq(likes.userId, userId))
    .orderBy(desc(likes.createdAt))
    .limit(limit);

  return result;
}

export async function getUserLikedSeeds(userId: string, dbInstance?: ReturnType<typeof getDb>): Promise<string[]> {
  const db = dbInstance || getDb();
  const result = await db
    .select({ paletteId: likes.paletteId })
    .from(likes)
    .where(eq(likes.userId, userId));
  return result.map(r => r.paletteId);
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

