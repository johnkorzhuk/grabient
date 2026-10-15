import { locale, msg, type Params, t } from "@grabient/i18n";
import * as v from "valibot";
import { READ_TIMEOUT } from "../../lib/query.ts";
import { itemKey } from "./address.ts";
import type { CollectionItemInput, FitVote, Visibility } from "./schema.ts";
import {
  CollectionDocumentSchema,
  CollectionNoteSchema,
  CollectionPageSchema,
  CopyStandingSchema,
  ViewerStateSchema
} from "./types.ts";

/* The browser's side of the collections API: an account's reads and every write. Each answer is checked against the
   shape the Worker writes, and a refusal comes back as an Error in the reader's language. */

const at = (slug: string) => encodeURIComponent(slug);

/** The language a public answer is asked in, for Grabient's translated collections. */
export const langQuery = (): string => (locale() === "en" ? "" : `lang=${locale()}`);
/* an address whose answer carries a collection, asked in the page's language: one of Grabient's comes translated, as
   the page shows it, so a press's answer never turns the page to English */
const inLanguage = (path: string): string => {
  const q = langQuery();
  return q ? `${path}${path.includes("?") ? "&" : "?"}${q}` : path;
};

/** A JSON call to the collections API, answered by `schema`: the answer, or an Error saying why in the reader's words. */
export async function call<S extends v.GenericSchema>(
  method: string,
  path: string,
  schema: S,
  body?: unknown,
  signal?: AbortSignal
): Promise<v.InferOutput<S>> {
  const timeout = AbortSignal.timeout(READ_TIMEOUT);
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout
  });
  const answer: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const said = answer as {
      error?: unknown;
      i18n?: { message?: unknown; params?: Params };
    } | null;
    const message =
      typeof said?.i18n?.message === "string"
        ? t(said.i18n.message, said.i18n.params)
        : t(typeof said?.error === "string" ? said.error : msg("Something went wrong. Try again."));
    throw Object.assign(new Error(message), { status: response.status });
  }
  return v.parse(schema, answer);
}
/** The status a refusal came with, or 0 for none heard. */
export const statusOf = (error: unknown): number => (error as { status?: number })?.status ?? 0;

const Changed = v.object({
  collection: v.looseObject({ ...CollectionDocumentSchema.entries }),
  restore: v.optional(v.string()),
  moved: v.optional(v.object({ from: v.string(), to: v.string() }))
});
const Saved = v.object({
  collection: CollectionDocumentSchema,
  made: v.boolean(),
  copy: v.nullable(CopyStandingSchema)
});
const Synced = v.object({ collection: CollectionDocumentSchema, copy: CopyStandingSchema });
const Voted = v.object({ seed: v.string(), vote: v.nullable(v.picklist(["up", "down"])) });
const Deleted = v.object({ deleted: v.string() });
const Added = v.object({
  title: v.string(),
  count: v.number(),
  added: v.array(
    v.object({
      seed: v.string(),
      style: v.string(),
      steps: v.number(),
      angle: v.number(),
      token: v.string()
    })
  )
});
const Choices = v.object({
  collections: v.array(
    v.object({
      slug: v.string(),
      title: v.string(),
      count: v.number(),
      updatedAt: v.number(),
      seeds: v.array(v.string())
    })
  )
});

/** A signed-in reader's standing on a collection, the collection itself in the page's language where they may see it. */
export const readState = (slug: string, signal?: AbortSignal) =>
  call(
    "GET",
    inLanguage(`/api/me/collections/${at(slug)}/state`),
    v.object({ ...ViewerStateSchema.entries, collection: v.optional(CollectionDocumentSchema) }),
    undefined,
    signal
  );
export const readOwn = (search: string, signal?: AbortSignal) =>
  call("GET", `/api/me/collections${search}`, CollectionPageSchema, undefined, signal);
export const readVotes = (slugs: readonly string[]) =>
  call(
    "GET",
    `/api/me/collection-votes?slugs=${encodeURIComponent(slugs.join(","))}`,
    v.object({ votes: v.record(v.string(), v.record(v.string(), v.picklist(["up", "down"]))) })
  );

/** A new private collection of the account's, of these palettes. */
export const makeCollection = (title: string, items: readonly CollectionItemInput[]) =>
  call("POST", "/api/collections", v.object({ collection: CollectionDocumentSchema }), {
    title,
    visibility: "private",
    items
  });
/** The owner's change to a collection's words, palettes or (an admin's) who sees it. */
export const changeCollection = (
  slug: string,
  patch: {
    title?: string;
    description?: string;
    visibility?: Visibility;
    items?: readonly CollectionItemInput[];
  }
) => call("PATCH", inLanguage(`/api/collections/${at(slug)}`), Changed, patch);
export const deleteCollection = (slug: string, why?: object) =>
  call("DELETE", `/api/collections/${at(slug)}`, Deleted, why ?? {});
export const saveCopy = (slug: string) =>
  call("POST", `/api/collections/${at(slug)}/copies`, Saved, {});
export const syncCopy = (slug: string, mode: "update" | "reset") =>
  call("POST", `/api/me/collections/${at(slug)}/${mode}`, Synced, {});
export const castVote = (slug: string, seed: string, vote: FitVote | null) =>
  call("POST", `/api/me/collections/${at(slug)}/votes`, Voted, { seed, vote });
export const addNote = (slug: string, text: string) =>
  call("POST", `/api/me/collections/${at(slug)}/notes`, v.object({ note: CollectionNoteSchema }), {
    text
  });
export const removeNote = (slug: string, id: string) =>
  call("DELETE", `/api/me/collections/${at(slug)}/notes/${encodeURIComponent(id)}`, Deleted);

const viewQuery = (item: Pick<CollectionItemInput, "style" | "steps" | "angle">) =>
  `?${new URLSearchParams({ style: item.style, steps: String(item.steps), angle: String(item.angle) })}`;
const itemPath = (slug: string, seed: string) =>
  `/api/me/collections/${at(slug)}/items/${encodeURIComponent(seed)}`;

/** One palette out of a collection, in its view: the owner's, with the token an undo sends; an admin's, on the record. */
export const removePalette = (slug: string, item: CollectionItemInput, why?: object) =>
  call("DELETE", inLanguage(itemPath(slug, item.seed) + viewQuery(item)), Changed, why ?? {});
/** The undo of a removal, from its token. */
export const restorePalette = (slug: string, seed: string, restore: string) =>
  call("PUT", inLanguage(itemPath(slug, seed)), Changed, { restore });
/** An admin draws one of Grabient's palettes another way. */
export const setPaletteView = (
  slug: string,
  from: CollectionItemInput,
  view: { style: string; steps: number; angle: number },
  why: object
) =>
  call("PATCH", inLanguage(itemPath(slug, from.seed) + viewQuery(from)), Changed, {
    ...view,
    ...why
  });
/** An admin's palettes into one of Grabient's collections, each with the token its undo sends. */
export const addSitePalettes = (slug: string, items: readonly CollectionItemInput[]) =>
  call("POST", `/api/me/collections/${at(slug)}/items`, Added, { items });
export const unaddSitePalette = (slug: string, item: CollectionItemInput, token: string) =>
  call("DELETE", inLanguage(itemPath(slug, item.seed) + viewQuery(item)), Changed, {
    added: token
  });
export const readSiteCollections = () => call("GET", "/api/me/site-collections", Choices);
export const readSiteHolding = (items: readonly CollectionItemInput[]) =>
  call(
    "POST",
    "/api/me/site-collections/holding",
    v.object({ holding: v.record(v.string(), v.number()) }),
    { items }
  );
/** An admin deletes a palette from the gallery and every one of Grabient's collections (the gallery's route). */
export const deletePalette = (seed: string, why: object) =>
  call(
    "DELETE",
    `/api/me/palettes/${encodeURIComponent(seed)}`,
    v.looseObject({ deleted: v.string() }),
    { ...why, scope: "everywhere" }
  );

/** A collection's items as the API takes them. */
export const inputOf = (item: {
  kseed?: string;
  seed?: string;
  style: string;
  steps: number;
  angle: number;
}) =>
  ({
    seed: item.kseed ?? item.seed ?? "",
    style: item.style,
    steps: item.steps,
    angle: item.angle
  }) as CollectionItemInput;
export const keyOf = (item: Parameters<typeof inputOf>[0]) => itemKey(inputOf(item));
