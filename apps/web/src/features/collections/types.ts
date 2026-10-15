import { STYLES } from "@grabient/engine/view.ts";
import * as v from "valibot";
import { RISING_FRAMES } from "../../lib/orders.ts";

/* What the collections API answers, as the Worker writes it and the browser reads it back. The browser checks every
   answer against these before a page draws it. */

const Style = v.picklist(STYLES);
const Visibility = v.picklist(["public", "private"]);

export type CollectionSort = "popular" | "rising" | "newest" | "oldest" | "hot";

/** A palette a list's card of a collection draws: as the collection saved it, with when it was made, its likes and its
    place in the collection, so a list's cards sort as the collection's own page does. */
export const CollectionPreviewSchema = v.object({
  seed: v.string(),
  style: Style,
  steps: v.number(),
  angle: v.number(),
  createdAt: v.optional(v.number()),
  likes: v.optional(v.number()),
  position: v.optional(v.number()),
  /** the week's rising score, in a list that opens its collections rising first */
  rising: v.optional(v.number())
});
export type CollectionPreview = v.InferOutput<typeof CollectionPreviewSchema>;

/** Who made a collection: an account by its username and display name, or an agent by its name. Never an account's id. */
const OwnerSchema = v.object({
  kind: v.picklist(["user", "agent"]),
  name: v.nullable(v.string()),
  display: v.optional(v.nullable(v.string()))
});
const SummaryEntries = {
  slug: v.string(),
  title: v.string(),
  description: v.string(),
  tags: v.array(v.string()),
  visibility: Visibility,
  owner: OwnerSchema,
  itemCount: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  /** how many accounts saved a copy: the collections' popularity */
  saves: v.number(),
  /** the address at the answering origin, for a reader that follows it */
  url: v.optional(v.string())
};
export const CollectionSummarySchema = v.object({
  ...SummaryEntries,
  preview: v.array(CollectionPreviewSchema)
});
export type CollectionSummary = v.InferOutput<typeof CollectionSummarySchema>;

/** A member palette as a page draws it: its view, likes, when it was made and its place, with its week's rising score. */
export const CollectionItemSchema = v.object({
  kseed: v.string(),
  style: Style,
  steps: v.number(),
  angle: v.number(),
  likes: v.number(),
  createdAt: v.number(),
  position: v.number(),
  rising: v.optional(v.number())
});
export type CollectionItem = v.InferOutput<typeof CollectionItemSchema>;

export const CollectionDocumentSchema = v.object({
  ...SummaryEntries,
  items: v.array(CollectionItemSchema),
  /** each tag's colors, in the tags' order: what a search of its words shows. The reads a page is drawn from bring
      them; the account's copy and a write's answer bring none */
  tagColors: v.optional(v.array(v.array(v.string())))
});
export type CollectionDocument = v.InferOutput<typeof CollectionDocumentSchema>;

export const CollectionPageSchema = v.object({
  query: v.string(),
  sort: v.picklist(["popular", "rising", "newest", "oldest", "hot"]),
  frame: v.optional(v.picklist(RISING_FRAMES)),
  page: v.number(),
  limit: v.number(),
  total: v.number(),
  totalPages: v.number(),
  fetchedAt: v.number(),
  items: v.array(CollectionSummarySchema),
  /** a search whose words could not be read in full for now: no cache keeps it for others */
  unkept: v.optional(v.boolean())
});
export type CollectionPage = v.InferOutput<typeof CollectionPageSchema>;

/** A collection a tag under the search field names, with its colors. */
export const CollectionHitSchema = v.object({
  title: v.string(),
  slug: v.string(),
  href: v.string(),
  colors: v.array(v.string())
});
export type CollectionHit = v.InferOutput<typeof CollectionHitSchema>;
export const SuggestSchema = v.object({ items: v.array(CollectionHitSchema) });

/** How a collection stands with the account's saved copy of it, or the account's own copy with its source. */
export const CopyStandingSchema = v.object({
  slug: v.string(),
  source: v.object({ slug: v.string(), title: v.string() }),
  /** the source changed in ways Update would bring in */
  behind: v.boolean(),
  /** the copy is not its source as it stands: Reset would change it */
  differs: v.boolean()
});
export type CopyStanding = v.InferOutput<typeof CopyStandingSchema>;

/** A note an admin left for the agents, and what it was written over. */
export const CollectionNoteSchema = v.object({
  id: v.string(),
  text: v.string(),
  createdAt: v.number(),
  author: v.string(),
  itemsThen: v.optional(v.array(v.string())),
  heldThen: v.optional(v.number()),
  changedSince: v.optional(v.number()),
  addedSince: v.optional(v.number())
});
export type CollectionNote = v.InferOutput<typeof CollectionNoteSchema>;

/** What readers said about one palette's fit: the votes, an admin's down (`slated`), and enough downs (`unfit`). */
export interface PaletteFit {
  up: number;
  down: number;
  slated: boolean;
  unfit: boolean;
}

/** What a signed-in reader may do on one collection's page, in one read: whether it is theirs, whether they may curate
    or delete it, their saved copy's standing, their fit votes and, for an admin, the notes. */
export const ViewerStateSchema = v.object({
  owned: v.boolean(),
  canCurate: v.boolean(),
  canDelete: v.boolean(),
  copy: v.nullable(CopyStandingSchema),
  votes: v.record(v.string(), v.picklist(["up", "down"])),
  notes: v.optional(v.array(CollectionNoteSchema))
});
export type ViewerState = v.InferOutput<typeof ViewerStateSchema>;
