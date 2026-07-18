import { Hono } from "hono";
import * as v from "valibot";
import { drizzle } from "drizzle-orm/d1";
import { ingestPalettes, type PaletteInput } from "@/lib/ingest";
import { ingestQuery } from "@/lib/query-ingest";
import {
  paletteStyleValidator,
  stepsValidator,
  angleValidator,
} from "@repo/data-ops/valibot-schema/grabient";
import { pairs, QUERY_CATEGORIES, STYLE_HINTS } from "@/db/schema";

/** LLM-chosen best-fit presentation for a palette. Queries never carry
 * presentation language; these describe how the PALETTE renders best. */
export const presentationFields = {
  style: v.optional(paletteStyleValidator),
  steps: v.optional(v.pipe(stepsValidator, v.integer())),
  angle: v.optional(v.pipe(angleValidator, v.integer())),
};

const bodySchema = v.object({
  runId: v.nullish(v.string()),
  query: v.object({
    text: v.string(),
    category: v.picklist(QUERY_CATEGORIES),
    styleHint: v.optional(v.picklist(STYLE_HINTS)),
  }),
  candidates: v.pipe(
    v.array(
      v.union([
        v.object({ coeffs: v.array(v.number()), ...presentationFields }),
        v.object({ hexColors: v.array(v.string()), ...presentationFields }),
      ]),
    ),
    v.minLength(1),
    v.maxLength(8),
  ),
});

/**
 * Forward-generation submit: one query plus its candidate palettes. The query
 * is deduped (embedding + normalized text); duplicate queries still get their
 * new candidates linked, so extra palettes for a well-covered query are kept
 * rather than thrown away.
 */
export const submitRoutes = new Hono<{ Bindings: Env }>().post(
  "/forward",
  async (c) => {
    const body = v.safeParse(bodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const { runId, query, candidates } = body.output;

    const queryOutcome = await ingestQuery(c.env, query, "forward", runId ?? null);
    if (queryOutcome.status === "rejected") {
      return c.json({ query: queryOutcome, accepted: [], rejected: [] });
    }

    const result = await ingestPalettes(
      c.env,
      candidates as PaletteInput[],
      "forward",
      runId ?? null,
    );

    const db = drizzle(c.env.DB);
    for (const palette of result.accepted) {
      await db
        .insert(pairs)
        .values({
          queryId: queryOutcome.id,
          paletteSeed: palette.seed,
          source: "forward",
          runId: runId ?? null,
          createdAt: Date.now(),
        })
        .onConflictDoNothing();
    }

    return c.json({ query: queryOutcome, ...result });
  },
);
