import { action, internalMutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";
import { deserializeCoeffs } from "@repo/data-ops/serialization";
import {
  applyGlobals,
  cosineGradient,
  rgbToHex,
} from "@repo/data-ops/gradient-gen";
import { generateSvgGradient } from "@repo/data-ops/gradient-gen/svg";

// R2 client
const r2 = new R2(components.r2);

// Image settings
const IMAGE_STEPS = 11;
const IMAGE_ANGLE = 90;
const IMAGE_WIDTH = 800;
const IMAGE_HEIGHT = 400;

let wasmInitialized = false;

function getHexColorsFromSeed(seed: string, steps: number): string[] {
  const { coeffs, globals } = deserializeCoeffs(seed);
  const appliedCoeffs = applyGlobals(coeffs, globals);
  const rgbColors = cosineGradient(steps, appliedCoeffs);
  return rgbColors.map((color) => rgbToHex(color[0], color[1], color[2]));
}

function generatePaletteSvg(seed: string): string {
  const hexColors = getHexColorsFromSeed(seed, IMAGE_STEPS);
  return generateSvgGradient(
    hexColors,
    "linearSwatches",
    IMAGE_ANGLE,
    { seed, searchString: "" },
    null,
    { width: IMAGE_WIDTH, height: IMAGE_HEIGHT }
  );
}

async function svgToPng(svgString: string): Promise<Uint8Array> {
  if (!wasmInitialized) {
    await initWasm(
      fetch("https://unpkg.com/@resvg/resvg-wasm/index_bg.wasm")
    );
    wasmInitialized = true;
  }

  const resvg = new Resvg(svgString, {
    background: "transparent",
    fitTo: {
      mode: "width",
      value: IMAGE_WIDTH,
    },
  });

  const pngData = resvg.render();
  return pngData.asPng();
}

/**
 * Insert a palette with its image URL (internal use)
 */
export const insertPalette = internalMutation({
  args: {
    seed: v.string(),
    imageUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("palettes")
      .withIndex("by_seed", (q) => q.eq("seed", args.seed))
      .first();

    if (existing) {
      return { inserted: false };
    }

    await ctx.db.insert("palettes", {
      seed: args.seed,
      imageUrl: args.imageUrl,
    });
    return { inserted: true };
  },
});

/**
 * Delete all palettes from database (internal)
 */
export const deletePalettes = internalMutation({
  handler: async (ctx) => {
    const palettes = await ctx.db.query("palettes").collect();
    let deleted = 0;

    for (const palette of palettes) {
      await ctx.db.delete(palette._id);
      deleted++;
    }

    return { deleted, seeds: palettes.map((p) => p.seed) };
  },
});

/**
 * Clear all palettes from database and delete images from R2
 */
export const clearDatabase = action({
  handler: async (ctx): Promise<{ palettesDeleted: number; imagesDeleted: number }> => {
    // Delete from database and get seeds
    const result: { deleted: number; seeds: string[] } = await ctx.runMutation(
      internal.seed.deletePalettes,
      {}
    );

    // Delete images from R2
    let imagesDeleted = 0;
    for (const seed of result.seeds) {
      try {
        const key = `palettes/${seed}.png`;
        await r2.deleteObject(ctx, key);
        imagesDeleted++;
      } catch {
        // Ignore if image doesn't exist
      }
    }

    return {
      palettesDeleted: result.deleted,
      imagesDeleted,
    };
  },
});

/**
 * Get count of palettes in the database
 */
export const getPaletteCount = query({
  handler: async (ctx) => {
    const palettes = await ctx.db.query("palettes").collect();
    return { count: palettes.length };
  },
});

/**
 * Import admin liked palettes from D1 via Cloudflare API
 * Generates images and uploads to R2 as it seeds each palette
 *
 * Required env vars (set in Convex Dashboard):
 * - CF_ACCOUNT_ID: Cloudflare account ID
 * - CF_API_TOKEN: Cloudflare API token with D1 read access
 * - CF_D1_DATABASE_ID: D1 database ID (grabient-prod)
 * - R2_PUBLIC_URL: Public URL for R2 bucket
 */
export const importFromD1 = action({
  args: {
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const accountId = process.env.CF_ACCOUNT_ID;
    const apiToken = process.env.CF_API_TOKEN;
    const databaseId = process.env.CF_D1_DATABASE_ID;
    const r2PublicUrl = process.env.R2_PUBLIC_URL;

    if (!accountId || !apiToken || !databaseId) {
      throw new Error(
        "Missing env vars: CF_ACCOUNT_ID, CF_API_TOKEN, CF_D1_DATABASE_ID"
      );
    }

    if (!r2PublicUrl) {
      throw new Error("Missing R2_PUBLIC_URL env var");
    }

    console.log("Querying D1 for admin liked palettes...");

    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sql: `SELECT DISTINCT l.palette_id FROM likes l JOIN auth_user u ON l.user_id = u.id WHERE u.role = 'admin'`,
        }),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`D1 API error: ${response.status} ${text}`);
    }

    const data = await response.json();

    if (!data.success || !data.result?.[0]?.results) {
      throw new Error(`D1 query failed: ${JSON.stringify(data)}`);
    }

    const seeds: string[] = data.result[0].results.map(
      (row: { palette_id: string }) => row.palette_id
    );

    console.log(`Found ${seeds.length} admin liked seeds in D1`);

    if (seeds.length === 0) {
      return { imported: 0, skipped: 0, failed: 0, total: 0 };
    }

    const batchSize = args.batchSize ?? 10;
    let totalInserted = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (let i = 0; i < seeds.length; i += batchSize) {
      const batch = seeds.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      console.log(`Processing batch ${batchNum}: ${batch.length} palettes...`);

      for (const seed of batch) {
        try {
          // Generate image
          const svg = generatePaletteSvg(seed);
          const pngData = await svgToPng(svg);
          const blob = new Blob([pngData.slice().buffer], { type: "image/png" });

          // Upload to R2
          const key = `palettes/${seed}.png`;
          await r2.store(ctx, blob, { key, type: "image/png" });
          const imageUrl = `${r2PublicUrl}/${key}`;

          // Insert palette with image URL
          const result = await ctx.runMutation(internal.seed.insertPalette, {
            seed,
            imageUrl,
          });

          if (result.inserted) {
            totalInserted++;
          } else {
            totalSkipped++;
          }
        } catch (error) {
          console.error(`Failed to process ${seed}:`, error);
          totalFailed++;
        }
      }

      console.log(
        `Batch ${batchNum} complete: ${totalInserted} inserted, ${totalSkipped} skipped, ${totalFailed} failed`
      );
    }

    console.log(
      `Import complete: ${totalInserted} inserted, ${totalSkipped} skipped, ${totalFailed} failed`
    );

    return {
      imported: totalInserted,
      skipped: totalSkipped,
      failed: totalFailed,
      total: seeds.length,
    };
  },
});
