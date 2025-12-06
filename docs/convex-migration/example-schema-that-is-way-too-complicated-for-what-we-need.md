```ts
import { defineSchema } from "convex/server";
import { v } from "convex/values";
import { Table } from "convex-helpers/server";
import { z } from "zod";
import { zodToConvex } from "convex-helpers/server/zod";
import { COLLECTION_STYLES } from "../src/validators";

// Define the exact type for a 4-element number tuple
export const numberTuple4Schema = z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .describe("RGB components (any number) + alpha (always 1)");

// Define the gradient coefficients schema
export const gradientCoeffsSchema = z
    .tuple([
        numberTuple4Schema,
        numberTuple4Schema,
        numberTuple4Schema,
        numberTuple4Schema,
    ])
    .describe(
        "Cosine gradient formula: color(t) = a + b * cos(2π * (c*t + d))",
    );

export const styleSchema = z.enum(COLLECTION_STYLES);
export const stepsSchema = z.number().min(2).max(50);
export const angleSchema = z.number().min(0).max(360);

export const collectionSchema = z.object({
    coeffs: gradientCoeffsSchema.describe(
        "Four coefficient vectors: offset (a), amplitude (b), frequency (c), phase (d)",
    ),
    style: styleSchema.describe(
        "Gradient rendering style (linear/angular, gradient/swatches)",
    ),
    steps: stepsSchema.describe("Number of color stops (2-50)"),
    angle: angleSchema.describe("Gradient rotation in degrees (0-360)"),
});

export const stepsValidator = zodToConvex(stepsSchema);
export const styleValidator = zodToConvex(styleSchema);
export const angleValidator = zodToConvex(angleSchema);

export const PopularCollections = Table("popular", {
    seed: v.string(),
    likes: v.number(),
    coeffs: zodToConvex(gradientCoeffsSchema),
    steps: stepsValidator,
    style: styleValidator,
    angle: angleValidator,
});

export const Likes = Table("likes", {
    seed: v.string(),
    userId: v.string(),
    steps: stepsValidator,
    style: styleValidator,
    angle: angleValidator,
    isPublic: v.boolean(),
});

export const Collections = Table("collections", {
    coeffs: zodToConvex(gradientCoeffsSchema),
    steps: stepsValidator,
    style: styleValidator,
    angle: angleValidator,
    seed: v.string(),
    likes: v.number(),
});

export const CollectionsAnalysis = Table("collections_analysis", {
    collectionId: v.id("collections"),
    existingTags: v.array(v.string()),
    additionalTags: v.array(v.string()),
    model: v.union(
        v.literal("gemini-2.0-flash-lite"),
        v.literal("gpt-4o-mini"),
    ),
    meta: v.object({
        temperature: v.number(),
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
        duration: v.number(),
    }),
});

export const TagAnalysis = Table("tag_analysis", {
    collectionId: v.id("collections"),
    tagFrequency: v.record(v.string(), v.number()),
    meta: v.object({
        temperature: v.number(),
        promptTokens: v.number(),
        completionTokens: v.number(),
        totalTokens: v.number(),
        duration: v.number(),
    }),
    existingTags: v.array(v.string()),
    additionalTags: v.array(v.string()),
    model: v.union(
        v.literal("gemini-2.5-pro-preview-05-06"),
        v.literal("gemini-2.5-flash-preview-05-20"),
        v.literal("gpt-4o-mini"),
    ),
});

export const TaggedCollections = Table("tagged_collections", {
    tag: v.string(),
    collectionId: v.id("collections"),
});

export default defineSchema({
    collections: Collections.table
        .index("seed", ["seed"])
        .index("likes", ["likes"]),
    tagged_collections: TaggedCollections.table
        .index("tag", ["tag"])
        .index("collectionId", ["collectionId"])
        .searchIndex("search_tag", {
            searchField: "tag",
        }),
    collections_analysis: CollectionsAnalysis.table.index("collectionId", [
        "collectionId",
    ]),
    tag_analysis: TagAnalysis.table.index("collectionId", ["collectionId"]),
    likes: Likes.table
        .index("seed", ["seed"])
        .index("userId", ["userId"])
        .index("byUserIdAndSeed", ["userId", "seed"])
        .index("isPublic", ["isPublic"]),
    popular: PopularCollections.table.index("likes", ["likes"]),
});
```
