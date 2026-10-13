/* The model reading words the vocabulary cannot: one Workers AI embedding per distinct text, kept in the isolate and at
   the edge for a month, so a text is bought once per data center however often it is searched. It is bought only
   within the payer's allowance and the day's ceiling, never for a HEAD request, a crawler or a text with no word left,
   and never while an admin has turned search by meaning off. The answer is always read from the snapshot. */
import { msg } from "@grabient/i18n";
import { normalizeQuery } from "@grabient/search/text.ts";
import { type Tower, textSide } from "@grabient/search/tower.ts";
import type { Env } from "@grabient/server/env.ts";
import { flagOff } from "@grabient/server/flags/flags.ts";
import { clientAddress } from "@grabient/server/limits/address.ts";
import { checkLimits, type LimitCheck } from "@grabient/server/limits/check.ts";
import type { LimitName } from "@grabient/server/limits/config.ts";
import { isCrawler } from "../crawlers.ts";
import { loadFallbackModel, loadModel, loadVocabulary } from "./files.ts";
import { keep } from "./kept.ts";
import { queryWords } from "./read.ts";
import type { Background } from "./snapshot.ts";

export type ModelEnv = Pick<Env, "ASSETS" | "DB"> &
  Partial<Pick<Env, "AI" | "RATE_LIMITER" | "DEPLOYMENT" | "USAGE">>;

/** Who pays for an embedding beside the site's day: a connected app's account (`app`), a signed-in account
    (`account`), or, when neither, the address asking. */
export type Payer = { app: string } | { account: string };

export type ModelAnswer =
  | { vector: number[] }
  | { limited: true; retryAfter: number; message: string }
  | null;

const VECTOR_TTL = 30 * 86400;
const HELD = 4000;

class Limited extends Error {
  readonly retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message);
    this.retryAfter = retryAfter;
  }
}

/* The address by the minute and the day, then the visitors' day. An app's account counts in place of the address its
   people share, under the apps' own day; a signed-in account under its own allowance and the site's day of account
   searches. */
function allowances(
  payer: Payer | undefined,
  request?: Request
): { checks: LimitCheck[]; day: LimitName } {
  if (payer && "app" in payer) {
    return {
      checks: [
        [`search-model:acct:${payer.app}`, ["searchModel", "searchModelDaily"]],
        ["search-model-apps", "searchModelApps"]
      ],
      day: "searchModelApps"
    };
  }
  if (payer) {
    return {
      checks: [
        [`search-account:${payer.account}`, ["searchAccount", "searchAccountDaily"]],
        ["search-budget", "searchBudget"]
      ],
      day: "searchBudget"
    };
  }
  const address = request ? clientAddress(request) : null;
  return {
    checks: [
      ...(address
        ? [[`search-model:${address}`, ["searchModel", "searchModelDaily"]] as const]
        : []),
      ["search-model-budget", "searchModelBudget"]
    ],
    day: "searchModelBudget"
  };
}

/** Raw embeddings of these texts from a model file's embedder, in order: null for one Workers AI did not give. */
export async function embeddings(
  ai: Ai,
  tower: Tower,
  texts: string[]
): Promise<(number[] | null)[]> {
  // the embedder is the one the model file names, which no literal type of Workers AI's knows
  const run = ai.run.bind(ai) as unknown as (
    model: string,
    input: { text: string[] }
  ) => Promise<{ data?: number[][] }>;
  const result = await run(tower.embedder, { text: texts });
  return texts.map((_, i) => result.data?.[i] ?? null);
}

/** One text through a model's text side: the primary embedder, or the fallback when it fails. Both land in the same
    space, so switching needs no other vectors. */
async function embedText(ai: Ai, env: ModelEnv, text: string): Promise<number[]> {
  const run = async (tower: Tower | null) => {
    if (!tower) throw new Error("The search model is not available");
    const [vector] = await embeddings(ai, tower, [text]);
    if (!vector || vector.length !== tower.demb || vector.some(n => !Number.isFinite(n))) {
      throw new Error("Invalid search embedding");
    }
    return Array.from(textSide(tower, vector));
  };
  try {
    return await run(await loadModel(env));
  } catch {
    return run(await loadFallbackModel(env));
  }
}

const held = new WeakMap<Ai, Map<string, number[]>>();
const edgeCache = () => (globalThis as { caches?: { default?: Cache } }).caches?.default;
const vectorKey = (version: string, text: string) =>
  `https://search.invalid/vector/${version}/${encodeURIComponent(text)}`;

/** A text's vector, kept or bought. `buy` runs only when it has to be bought, and refuses by throwing. */
async function queryVector(
  ai: Ai,
  env: ModelEnv,
  version: string,
  text: string,
  buy: () => Promise<void>,
  ctx?: Background
): Promise<number[]> {
  let mine = held.get(ai);
  if (!mine) {
    mine = new Map();
    held.set(ai, mine);
  }
  const key = vectorKey(version, text);
  const kept = mine.get(key);
  if (kept) return kept;
  const cache = edgeCache();
  const hit = await cache?.match(key).catch(() => undefined);
  const stored = hit
    ? ((await hit.json().catch(() => null)) as { vector?: number[] } | null)?.vector
    : undefined;
  if (stored?.length) return keep(mine, key, stored, HELD);
  await buy();
  const bought = keep(mine, key, await embedText(ai, env, text), HELD);
  if (cache) {
    const put = cache
      .put(
        key,
        Response.json(
          { vector: bought },
          { headers: { "Cache-Control": `public, max-age=${VECTOR_TTL}` } }
        )
      )
      .catch(() => {});
    if (ctx) ctx.waitUntil(put);
    else await put;
  }
  return bought;
}

/** The query's vector from the model, null when the model may not read it (unbound, turned off, a HEAD request, no
    word left, a crawler with nothing kept, a limiter that cannot answer), or `limited` with the seconds to wait when an
    allowance is spent. */
export async function modelQuery(
  env: ModelEnv,
  query: string,
  options: { request?: Request; ctx?: Background; payer?: Payer } = {}
): Promise<ModelAnswer> {
  const text = normalizeQuery(query);
  const { AI } = env;
  if (!text || !AI || (await flagOff(env, "model-search"))) return null;
  const voc = await loadVocabulary(env);
  if (!voc || options.request?.method === "HEAD" || !queryWords(text).length) return null;
  const buy = async () => {
    // a crawler reads a vector a person bought and is never sold one: its page is noindex
    if (!options.payer && options.request && isCrawler(options.request))
      throw new Error("No model for a crawler");
    const { checks, day } = allowances(options.payer, options.request);
    const result = await checkLimits(env, checks);
    if (!result) throw new Error("The limiter could not answer");
    if (!result.success) {
      const message =
        result.type === day
          ? msg("Search is busy. Try again later.")
          : msg("Too many searches. Try again in a moment.");
      throw new Limited(message, Math.max(1, result.reset - Math.floor(Date.now() / 1000)));
    }
  };
  try {
    return { vector: await queryVector(AI, env, voc.version, text, buy, options.ctx) };
  } catch (error) {
    return error instanceof Limited
      ? { limited: true, retryAfter: error.retryAfter, message: error.message }
      : null;
  }
}
