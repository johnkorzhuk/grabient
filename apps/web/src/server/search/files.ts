/* The search files (public/search): the two model files and the vocabulary, static assets read through the ASSETS
   binding once per isolate. A failed read is not remembered, so the next search tries again. */
import {
  createLexicon,
  type Lexicon,
  type LexiconFile,
  withEmoji
} from "@grabient/search/lexicon.ts";
import { loadTower, type Tower } from "@grabient/search/tower.ts";
import { type AssetsEnv, asset, once } from "../assets.ts";

export interface Vocabulary {
  version: string;
  d: number;
  phrases: string[];
  /** a 64-number vector per phrase, in row order */
  vectors: Float32Array;
  lexicon: Lexicon;
  /** runs of [first row, kind]: the category a phrase was written under for training, or a collection's title */
  kinds: [number, string][];
}

/** A search file as the deploy serves it. */
export const searchAsset = (env: AssetsEnv, name: string): Promise<Response> =>
  asset(env, `/search/${name}`);

export const loadVocabulary = once(async (env): Promise<Vocabulary> => {
  const [head, vectors, lex, emoji] = await Promise.all([
    searchAsset(env, "vocab.json").then(
      r => r.json() as Promise<Omit<Vocabulary, "vectors" | "lexicon">>
    ),
    searchAsset(env, "vocab.bin").then(r => r.arrayBuffer()),
    searchAsset(env, "lex.json").then(r => r.json() as Promise<LexiconFile>),
    searchAsset(env, "emoji.json").then(r => r.json() as Promise<Record<string, string>>)
  ]);
  if (vectors.byteLength !== head.phrases.length * head.d * 4) {
    throw new Error("vocab.bin does not match vocab.json");
  }
  return {
    ...head,
    vectors: new Float32Array(vectors),
    lexicon: createLexicon(withEmoji(lex, emoji, head.phrases))
  };
});

const towerFile = (name: string) =>
  once(async env => loadTower(await (await searchAsset(env, name)).arrayBuffer()));
export const loadModel: (env: AssetsEnv) => Promise<Tower | null> = towerFile("tower.bin");
/** The same palette side with a text side for the second embedder, read only when the first fails. */
export const loadFallbackModel: (env: AssetsEnv) => Promise<Tower | null> =
  towerFile("tower-fallback.bin");

/** One phrase's place in the search space. */
export const phraseVector = (voc: Vocabulary, row: number): Float32Array =>
  voc.vectors.subarray(row * voc.d, (row + 1) * voc.d);

/** The kind of the phrase at this row. */
export function kindAt(voc: Vocabulary, row: number): string | undefined {
  let kind: string | undefined;
  for (const [first, name] of voc.kinds) {
    if (first > row) break;
    kind = name;
  }
  return kind;
}
