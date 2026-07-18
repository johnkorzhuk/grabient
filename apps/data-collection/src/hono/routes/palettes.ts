import { Hono } from "hono";
import * as v from "valibot";
import { canonicalize, toFlat12 } from "@/lib/features";
import { fitCosinePalette } from "@repo/data-ops/gradient-gen";
import { findSimilarPalettes } from "@/lib/dedup";
import { ingestPalettes, type PaletteInput } from "@/lib/ingest";
import { PALETTE_SOURCES } from "@/db/schema";

const paletteInputSchema = v.union([
  v.object({ coeffs: v.array(v.number()) }),
  v.object({ hexColors: v.array(v.string()) }),
]);

const similarBodySchema = v.object({
  coeffs: v.optional(v.array(v.number())),
  hexColors: v.optional(v.array(v.string())),
  topK: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20))),
});

const batchBodySchema = v.object({
  runId: v.nullish(v.string()),
  source: v.picklist(PALETTE_SOURCES),
  palettes: v.pipe(v.array(paletteInputSchema), v.maxLength(50)),
});

export const paletteRoutes = new Hono<{ Bindings: Env }>()
  .post("/similar", async (c) => {
    const body = v.safeParse(similarBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const { coeffs, hexColors, topK } = body.output;
    try {
      const flat12 = coeffs ?? toFlat12(fitCosinePalette(hexColors ?? []).coeffs);
      const canonical = canonicalize(flat12);
      const result = await findSimilarPalettes(c.env, canonical, topK ?? 5);
      return c.json({ seed: canonical.seed, hexStops: canonical.hexStops, ...result });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "invalid palette" },
        400,
      );
    }
  })
  .post("/batch", async (c) => {
    const body = v.safeParse(batchBodySchema, await c.req.json());
    if (!body.success) {
      return c.json({ error: "invalid body", issues: body.issues }, 400);
    }
    const { runId, source, palettes: inputs } = body.output;
    const result = await ingestPalettes(
      c.env,
      inputs as PaletteInput[],
      source,
      runId ?? null,
    );
    return c.json(result);
  });
