/* Training, step 2: the text side's input. Every phrase of cache/rows.json and every translation of it, written as a
   query reaches the Worker (normalizeQuery), embedded with both models the search can use. Writes cache/texts.json and,
   per embedder, cache/phrases-<alias>.npy and cache/translations-<alias>.npy.
     node scripts/search/train-texts.ts          (with cf logged in: see embed.ts) */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeQuery } from "@grabient/search/text.ts";
import { EMBEDDERS, type Embedder, embedTexts } from "./embed.ts";
import { writeNpy } from "./npy.ts";
import { CACHE as cache, TRAIN } from "./paths.ts";

const { phrases } = JSON.parse(readFileSync(resolve(cache, "rows.json"), "utf8")) as {
  phrases: string[];
};
// a language's entry is one form or a list of them: each is a key of its own
const translated = JSON.parse(
  readFileSync(resolve(TRAIN, "data/translations.json"), "utf8")
) as Record<string, Record<string, string | string[]>>;
const phraseTexts = phrases.map(normalizeQuery);
const translations = phrases.flatMap((phrase, i) =>
  Object.entries(translated[phrase] ?? {}).flatMap(([lang, forms]) =>
    [forms]
      .flat()
      .map(normalizeQuery)
      .filter(Boolean)
      .map(text => ({ i, lang, text }))
  )
);
writeFileSync(resolve(cache, "texts.json"), JSON.stringify({ phrases: phraseTexts, translations }));
for (const alias of Object.keys(EMBEDDERS) as Embedder[]) {
  const own = await embedTexts(alias, phraseTexts);
  const other = await embedTexts(
    alias,
    translations.map(t => t.text)
  );
  writeNpy(resolve(cache, `phrases-${alias}.npy`), own.rows, own.dims, own.data);
  writeNpy(resolve(cache, `translations-${alias}.npy`), other.rows, other.dims, other.data);
  console.log(`${alias}: ${own.rows} phrases, ${other.rows} translations, ${own.dims} dimensions`);
}
