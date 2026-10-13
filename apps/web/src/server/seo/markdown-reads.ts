import type { Env } from "@grabient/server/env.ts";
import { collectionForFiles, isCollectionSlug, paletteWords } from "../collections/files.ts";
import type { MarkdownReads } from "./markdown.ts";

/** What the Markdown files read, from the collections area: a palette's words and a public collection. */
export const markdownReads = (env: Pick<Env, "DB">): MarkdownReads => ({
  paletteWords: seed => paletteWords(env, seed),
  collection: address => collectionForFiles(env, address),
  isCollection: isCollectionSlug
});
