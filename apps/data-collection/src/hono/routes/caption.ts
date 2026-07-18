import { Hono } from "hono";
import * as v from "valibot";
import { drizzle } from "drizzle-orm/d1";
import { and, eq, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { ingestQuery } from "@/lib/query-ingest";
import { applyBandingFloor, toCosineCoeffs } from "@/lib/features";
import { presentationFields } from "./submit";
import { palettes, pairs, QUERY_CATEGORIES, STYLE_HINTS } from "@/db/schema";

export const LEASE_TTL_MS = 15 * 60 * 1000;

const leaseBodySchema = v.object({
  runId: v.nullish(v.string()),
  limit: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(30))),
});

const submitBodySchema = v.object({
  runId: v.nullish(v.string()),
  seed: v.string(),
  // Free-form semantic themes for the palette (coverage/eval metadata).
  themes: v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.trim(), v.toLowerCase(), v.minLength(1))),
      v.maxLength(6),
    ),
  ),
  // Better-fit presentation for the palette (LLM has looked at the colors;
  // sampler-created palettes only have the heuristic derivation).
  presentation: v.optional(v.object(presentationFields)),
  queries: v.pipe(
    v.array(
      v.object({
        text: v.string(),
        category: v.picklist(QUERY_CATEGORIES),
        styleHint: v.optional(v.picklist(STYLE_HINTS)),
      }),
    ),
    v.minLength(1),
    v.maxLength(6),
  ),
});

export const captionRoutes = new Hono<{ Bindings: Env }>()
  // Lease palettes that have no pairs yet (backward-captioning targets).
  .post("/lease", async (c) => {
    const body = v.safeParse(leaseBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const limit = body.output.limit ?? 10;
    const db = drizzle(c.env.DB);
    const cutoff = Date.now() - LEASE_TTL_MS;

    const paired = db.select({ seed: pairs.paletteSeed }).from(pairs);
    const rows = await db
      .select({
        seed: palettes.seed,
        hexStops: palettes.hexStops,
        tags: palettes.tags,
        brightness: palettes.brightness,
        contrast: palettes.contrast,
        style: palettes.style,
        steps: palettes.steps,
        angle: palettes.angle,
        themes: palettes.themes,
      })
      .from(palettes)
      .where(
        and(
          sql`${palettes.status} != 'rejected'`,
          notInArray(palettes.seed, paired),
          or(isNull(palettes.captionLockedAt), lt(palettes.captionLockedAt, cutoff)),
        ),
      )
      .limit(limit);

    const now = Date.now();
    for (const row of rows) {
      await db
        .update(palettes)
        .set({ captionLockedAt: now, updatedAt: now })
        .where(eq(palettes.seed, row.seed));
    }
    return c.json({ palettes: rows });
  })
  .post("/submit", async (c) => {
    const body = v.safeParse(submitBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const { runId, seed, themes, presentation, queries: queryInputs } = body.output;
    const db = drizzle(c.env.DB);

    const palette = await db
      .select({
        seed: palettes.seed,
        coeffs: palettes.coeffs,
        style: palettes.style,
        steps: palettes.steps,
      })
      .from(palettes)
      .where(eq(palettes.seed, seed))
      .limit(1);
    if (!palette[0]) return c.json({ error: "unknown seed" }, 404);

    // Whatever style/steps end up effective, gradient styles keep the
    // banding floor (see applyBandingFloor).
    let flooredPresentation = presentation;
    if (presentation) {
      const effectiveStyle = presentation.style ?? palette[0].style;
      const effectiveSteps = presentation.steps ?? palette[0].steps;
      if (effectiveStyle && effectiveSteps != null) {
        flooredPresentation = {
          ...presentation,
          ...(presentation.steps !== undefined || presentation.style !== undefined
            ? {
                steps: applyBandingFloor(
                  effectiveStyle,
                  effectiveSteps,
                  toCosineCoeffs(palette[0].coeffs),
                ),
              }
            : {}),
        };
      }
    }

    const results = [];
    for (const input of queryInputs) {
      const outcome = await ingestQuery(c.env, input, "caption", runId ?? null);
      if (outcome.status !== "rejected") {
        await db
          .insert(pairs)
          .values({
            queryId: outcome.id,
            paletteSeed: seed,
            source: "caption",
            runId: runId ?? null,
            createdAt: Date.now(),
          })
          .onConflictDoNothing();
      }
      results.push({ text: input.text, ...outcome });
    }

    await db
      .update(palettes)
      .set({
        captionLockedAt: null,
        updatedAt: Date.now(),
        ...(themes !== undefined && { themes }),
        ...(flooredPresentation?.style !== undefined && {
          style: flooredPresentation.style,
        }),
        ...(flooredPresentation?.steps !== undefined && {
          steps: flooredPresentation.steps,
        }),
        ...(flooredPresentation?.angle !== undefined && {
          angle: flooredPresentation.angle,
        }),
      })
      .where(eq(palettes.seed, seed));

    return c.json({ seed, queries: results });
  });
