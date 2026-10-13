/* Text embeddings from Workers AI for the offline steps (training texts, collection texts), kept in a local cache so a
   text is paid for once. They come through `cf ai run`, on the account cf is logged in to (`cf auth login`), which
   bills each text it embeds. */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { resolve } from "node:path";
import { cf } from "./cf.ts";
import { CACHE } from "./paths.ts";

export const EMBEDDERS = {
  gemma: { model: "@cf/google/embeddinggemma-300m", dims: 768 },
  m3: { model: "@cf/baai/bge-m3", dims: 1024 }
} as const;
export type Embedder = keyof typeof EMBEDDERS;

const BATCH = 96;
const AT_ONCE = 4;
const ATTEMPTS = 5;

/* one embedder's cache: the texts in row order, one JSON line each, beside one flat float32 file */
function openCache(alias: Embedder) {
  mkdirSync(CACHE, { recursive: true });
  const keysFile = resolve(CACHE, `emb-${alias}.keys.jsonl`);
  const dataFile = resolve(CACHE, `emb-${alias}.f32`);
  const { dims } = EMBEDDERS[alias];
  const keys: string[] = existsSync(keysFile)
    ? readFileSync(keysFile, "utf8")
        .split("\n")
        .filter(Boolean)
        .map(line => JSON.parse(line) as string)
    : [];
  const bytes = existsSync(dataFile) ? readFileSync(dataFile) : Buffer.alloc(0);
  if (bytes.byteLength !== keys.length * dims * 4) {
    throw new Error(
      `The ${alias} embedding cache is torn: delete cache/emb-${alias}.* and embed again.`
    );
  }
  const data = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  );
  const at = new Map(keys.map((key, i) => [key, i]));
  return {
    at,
    get: (text: string) => {
      const i = at.get(text);
      return i === undefined ? null : data.subarray(i * dims, (i + 1) * dims);
    },
    add(texts: string[], vectors: number[][]) {
      appendFileSync(
        dataFile,
        Buffer.concat(vectors.map(v => Buffer.from(Float32Array.from(v).buffer)))
      );
      appendFileSync(keysFile, texts.map(text => `${JSON.stringify(text)}\n`).join(""));
    }
  };
}

let asked = 0;

/* One batch. Its body goes through a file, since a batch of collection texts can be longer than one command-line
   argument may be. */
async function ask(model: string, dims: number, texts: string[]): Promise<number[][]> {
  const body = resolve(CACHE, `request-${process.pid}-${++asked}.json`);
  writeFileSync(body, JSON.stringify({ text: texts }));
  try {
    for (let attempt = 1; ; attempt++) {
      try {
        const answer = (await cf(["ai", "run", model, "--body", `@${body}`])) as {
          data?: number[][];
          result?: { data?: number[][] };
        };
        const vectors = answer.data ?? answer.result?.data;
        if (vectors?.length !== texts.length || vectors.some(vector => vector.length !== dims)) {
          throw new Error(`${model} answered with another shape`);
        }
        return vectors;
      } catch (error) {
        if (attempt >= ATTEMPTS) throw new Error(`Embedding failed: ${(error as Error).message}`);
        await new Promise(done => setTimeout(done, 1500 * attempt));
      }
    }
  } finally {
    rmSync(body, { force: true });
  }
}

/** The texts' embeddings in order, as the rows of one Float32Array. New texts are embedded in batches and kept. */
export async function embedTexts(alias: Embedder, texts: readonly string[]) {
  const { model, dims } = EMBEDDERS[alias];
  let cache = openCache(alias);
  const missing = [...new Set(texts.filter(text => !cache.at.has(text)))];
  if (missing.length) {
    const batches: string[][] = [];
    for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(AT_ONCE, batches.length) }, async () => {
        while (next < batches.length) {
          const mine = batches[next++];
          cache.add(mine, await ask(model, dims, mine));
        }
      })
    );
    console.error(`[embed] ${alias}: ${missing.length} new texts`);
    cache = openCache(alias);
  }
  const data = new Float32Array(texts.length * dims);
  texts.forEach((text, i) => {
    const vector = cache.get(text);
    if (!vector) throw new Error(`No embedding kept for ${JSON.stringify(text)}`);
    data.set(vector, i * dims);
  });
  return { rows: texts.length, dims, data };
}
