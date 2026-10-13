import { STYLES } from "@grabient/engine/view.ts";
import * as v from "valibot";

/* The collections as the home's feed reads them: a page of the collections list (`/api/collections`), each collection
   with its first palettes. The collections area owns the list and its answer; this is the shape the home draws. */

export const CollectionPreview = v.object({
  seed: v.string(),
  style: v.picklist(STYLES),
  steps: v.number(),
  angle: v.number(),
  createdAt: v.optional(v.nullable(v.number())),
  likes: v.optional(v.number()),
  position: v.optional(v.number())
});
export type CollectionPreview = v.InferOutput<typeof CollectionPreview>;

export const CollectionSummary = v.object({
  slug: v.string(),
  title: v.string(),
  description: v.string(),
  tags: v.array(v.string()),
  visibility: v.picklist(["public", "private"]),
  owner: v.object({
    kind: v.picklist(["user", "agent"]),
    name: v.nullable(v.string()),
    display: v.optional(v.nullable(v.string()))
  }),
  itemCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  saves: v.number(),
  preview: v.array(CollectionPreview)
});
export type CollectionSummary = v.InferOutput<typeof CollectionSummary>;

export const CollectionPage = v.object({
  query: v.string(),
  sort: v.string(),
  items: v.array(CollectionSummary),
  total: v.number(),
  page: v.number(),
  limit: v.number(),
  totalPages: v.number(),
  fetchedAt: v.number(),
  unkept: v.optional(v.boolean())
});
export type CollectionPage = v.InferOutput<typeof CollectionPage>;

/** How many collections a page of the list holds. */
export const COLLECTION_LIMIT = 24;
