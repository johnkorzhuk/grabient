import type { Env } from "@grabient/server/env.ts";
import { collectionForFiles, isCollectionSlug, paletteWords } from "../collections/files.ts";
import { colorNames } from "../files/names.ts";
import type { MarkdownReads } from "./markdown.ts";

/** What the Markdown files read: from the collections area a palette's words and a public collection, and the precise
    color names from the deploy's files. */
export const markdownReads = (
  env: Pick<Env, "DB"> & Partial<Pick<Env, "ASSETS">>
): MarkdownReads => ({
  paletteWords: seed => paletteWords(env, seed),
  collection: address => collectionForFiles(env, address),
  isCollection: isCollectionSlug,
  colorNames: () => colorNames(env)
});
