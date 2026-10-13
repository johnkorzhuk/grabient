import type { Env } from "../env.ts";
import { countUsage } from "../usage/count.ts";
import { type LimitName, limitOf } from "./config.ts";
import type { Counted } from "./rate-limiter.ts";

/* Counting a request against its limits, cheapest first. What this isolate already knows refuses at once: a limit it
   has seen refused, or used up by itself. Then each check's isolate limits are counted here, its other limits are asked
   of the Durable Object named for its identifier in one request, and its leased limits are taken from blocks this
   isolate holds, asking only when a block runs out. The object stays the authority; the isolate's memory only saves
   asks, each of which is a billed request, a storage read and a write. */

/** One thing counted: who (an address, an account, an inbox, a site-wide key), by which limits, and how many. */
export type LimitCheck = readonly [
  identifier: string,
  names: LimitName | readonly LimitName[],
  n?: number
];

export interface LimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
  /** On a refusal, the limit that refused. */
  type?: LimitName;
}

/** The bindings counting needs: without a limiter, limits are counted in the isolate alone. */
export type LimitEnv = Partial<Pick<Env, "RATE_LIMITER" | "DEPLOYMENT" | "USAGE">>;

/* What this isolate counted of one limit for one identifier, until `reset` (seconds). A leased limit also keeps the
   units it holds unspent (`held`), its last block (`block`), what the object had left when last asked (`left`), when
   its ask for a block began (`asking`), and whether a block was refused (`exact`: from then on it asks for exactly
   what a request lacks). */
interface Tally {
  count: number;
  reset: number;
  denied: boolean;
  limit?: number;
  held?: number;
  block?: number;
  left?: number;
  asking?: number;
  exact?: boolean;
}

/* The site's ceilings, the leased and kept tallies, and the burst counts live apart, so a stream of new addresses can
   never push a spent ceiling or a held block out of memory. Each holds at most TALLY_MAX. */
interface Memory {
  site: Map<string, Tally>;
  kept: Map<string, Tally>;
  other: Map<string, Tally>;
}

const TALLY_MAX = 5000;
// An ask for a block that is not answered in this time (its request was cancelled) no longer holds others back.
const BLOCK_ASK_MS = 10_000;
const FIRST_BLOCK = 1;
const LOG_EVERY_MS = 3_600_000;

const newMemory = (): Memory => ({ site: new Map(), kept: new Map(), other: new Map() });
// One memory per namespace binding, and one for none: an isolate keeps its bindings from request to request.
const memories = new WeakMap<object, Memory>();
const unbound = newMemory();

function memoryOf(namespace: object | undefined): Memory {
  if (!namespace) return unbound;
  let memory = memories.get(namespace);
  if (!memory) {
    memory = newMemory();
    memories.set(namespace, memory);
  }
  return memory;
}

function shelfOf(memory: Memory, name: LimitName): Map<string, Tally> {
  const limit = limitOf(name);
  return limit.site ? memory.site : limit.lease || limit.kept ? memory.kept : memory.other;
}

function tallyOf(memory: Memory, name: LimitName, identifier: string, now: number): Tally {
  const shelf = shelfOf(memory, name);
  const key = `${name}:${identifier}`;
  let tally = shelf.get(key);
  if (tally && tally.reset * 1000 <= now) {
    shelf.delete(key);
    tally = undefined;
  }
  if (!tally) {
    if (shelf.size >= TALLY_MAX) {
      for (const [old, seen] of shelf) if (seen.reset * 1000 <= now) shelf.delete(old);
      if (shelf.size >= TALLY_MAX) shelf.delete(shelf.keys().next().value!);
    }
    tally = { count: 0, reset: Math.floor(now / 1000) + limitOf(name).window, denied: false };
    shelf.set(key, tally);
  }
  return tally;
}

const refusal = (type: LimitName, limit: number, reset: number, remaining = 0): LimitResult => ({
  success: false,
  limit,
  remaining,
  reset,
  type
});

function knownRefusal(
  memory: Memory,
  [identifier, names, n = 1]: LimitCheck,
  now: number,
  deployment?: string
): LimitResult | null {
  for (const name of namesOf(names)) {
    const tally = shelfOf(memory, name).get(`${name}:${identifier}`);
    if (!tally || tally.reset * 1000 <= now) continue;
    const limit = tally.limit ?? limitOf(name, deployment).requests;
    if (tally.denied || tally.count + n > limit) return refusal(name, limit, tally.reset);
  }
  return null;
}

function countHere(
  tally: Tally,
  name: LimitName,
  n: number,
  deployment: string | undefined
): LimitResult {
  const limit = limitOf(name, deployment).requests;
  if (tally.count + n > limit) {
    return refusal(name, limit, tally.reset, Math.max(0, limit - tally.count));
  }
  tally.count += n;
  return { success: true, limit, remaining: limit - tally.count, reset: tally.reset };
}

interface Answer extends LimitResult {
  results: Counted[];
}

/* A leased limit for one request. Its units come out of what this isolate holds in one step with no wait in it, so
   requests waiting together never spend a unit twice. When they run short, the request asks for a block: FIRST_BLOCK,
   then twice the last, up to the lease, and never less than it lacks. One block is asked for at a time; a request
   arriving meanwhile asks for exactly what it lacks, so no request waits on another's ask. A refused block means less
   than a block is left, and from then on each request asks for exactly what it lacks. */
async function takeLeased(
  tally: Tally,
  name: LimitName,
  n: number,
  now: number,
  ask: (amount: number) => Promise<Answer>,
  deployment: string | undefined
): Promise<LimitResult> {
  const lease = limitOf(name).lease ?? 1;
  for (;;) {
    const held = tally.held ?? 0;
    if (held >= n) {
      tally.held = held - n;
      tally.count += n;
      const limit = tally.limit ?? limitOf(name, deployment).requests;
      return {
        success: true,
        limit,
        remaining: (tally.left ?? 0) + tally.held,
        reset: tally.reset
      };
    }
    if (tally.denied) {
      return refusal(name, tally.limit ?? limitOf(name, deployment).requests, tally.reset);
    }
    const lacking = n - held;
    const asksBlock =
      !tally.exact && !(tally.asking !== undefined && now - tally.asking < BLOCK_ASK_MS);
    const size = Math.min(lease, tally.block ? tally.block * 2 : FIRST_BLOCK);
    const amount = asksBlock ? Math.max(size, lacking) : lacking;
    if (asksBlock) tally.asking = now;
    let answer: Answer;
    try {
      answer = await ask(amount);
    } finally {
      if (asksBlock && tally.asking === now) tally.asking = undefined;
    }
    tally.reset = answer.reset;
    tally.limit = answer.limit;
    tally.left = answer.remaining;
    if (answer.success) {
      tally.held = (tally.held ?? 0) + amount;
      if (asksBlock) tally.block = size;
    } else if (amount > lacking) tally.exact = true;
    else tally.denied = true;
  }
}

const namesOf = (names: LimitCheck[1]): readonly LimitName[] =>
  typeof names === "string" ? [names] : names;

const counted = (name: LimitName) => !limitOf(name).local;

async function count(
  namespace: DurableObjectNamespace | undefined,
  checks: readonly LimitCheck[],
  deployment: string | undefined
): Promise<LimitResult> {
  const now = Date.now();
  const memory = memoryOf(namespace);
  for (const check of checks) {
    const known = knownRefusal(memory, check, now, deployment);
    if (known) return known;
  }
  let last: LimitResult = { success: true, limit: 0, remaining: 0, reset: Math.floor(now / 1000) };
  for (const [identifier, names, n = 1] of checks) {
    const remote = namespace ? namesOf(names).filter(counted) : [];
    for (const name of namesOf(names)) {
      if (remote.includes(name)) continue;
      last = countHere(tallyOf(memory, name, identifier, now), name, n, deployment);
      if (!last.success) return last;
    }
    if (!namespace || !remote.length) continue;
    // The object is found by a hash of the identifier, which goes no further: the request names only the limits.
    let stub: DurableObjectStub | undefined;
    const ask = async (asked: readonly LimitName[], amount: number): Promise<Answer> => {
      stub ??= namespace.get(namespace.idFromName(await limiterName(identifier)));
      const url = new URL("https://rate-limiter/");
      for (const name of asked) url.searchParams.append("type", name);
      if (amount !== 1) url.searchParams.set("n", String(amount));
      const response = await stub.fetch(url);
      if (response.status !== 200 && response.status !== 429) {
        throw new Error(`The rate limiter answered ${response.status}`);
      }
      return (await response.json()) as Answer;
    };
    const leased = remote.filter(name => limitOf(name).lease);
    const each = remote.filter(name => !limitOf(name).lease);
    if (each.length) {
      const answer = await ask(each, n);
      for (const result of answer.results) {
        const tally = tallyOf(memory, result.type, identifier, now);
        tally.reset = result.reset;
        tally.limit = result.limit;
        if (answer.success) tally.count += n;
        else if (!result.success) tally.denied = true;
      }
      if (!answer.success) {
        const refused = answer.results.find(result => !result.success);
        return refusal(refused?.type ?? each[0]!, answer.limit, answer.reset, answer.remaining);
      }
      last = {
        success: true,
        limit: answer.limit,
        remaining: answer.remaining,
        reset: answer.reset
      };
    }
    for (const name of leased) {
      const tally = tallyOf(memory, name, identifier, now);
      last = await takeLeased(tally, name, n, now, amount => ask([name], amount), deployment);
      if (!last.success) return last;
    }
  }
  return last;
}

/** The name of the object a limit is counted in: a hash of what it counts. The platform keeps an object's name, so it
    is never the address or email itself. */
export async function limiterName(identifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`grabient-limit:${identifier}`)
  );
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/* Said in the Worker's logs at most once an hour per isolate and per line, so a day's allowance running out, or the
   limiter failing, is seen without a line for every request it refused. */
const logged = new Map<string, number>();
function logHourly(line: string, detail: unknown) {
  const now = Date.now();
  if (now - (logged.get(line) ?? 0) < LOG_EVERY_MS) return;
  logged.set(line, now);
  console.warn(line, JSON.stringify(detail));
}

/**
 * Counts one request against its limits. Put each address's and account's checks before the site's, so a client past
 * its own allowance never spends the site's. Null when the Durable Object could not answer, or when a production deploy
 * lost its binding (counting in each isolate apart would multiply every ceiling): the caller refuses.
 */
export async function checkLimits(
  env: LimitEnv,
  checks: readonly LimitCheck[]
): Promise<LimitResult | null> {
  const durable = checks.some(([, names]) => namesOf(names).some(counted));
  if (durable && !env.RATE_LIMITER && env.DEPLOYMENT === "production") {
    logHourly("rate limiter unavailable", { reason: "not bound" });
    return null;
  }
  let result: LimitResult;
  try {
    result = await count(env.RATE_LIMITER, checks, env.DEPLOYMENT);
  } catch (error) {
    logHourly("rate limiter unavailable", {
      reason: error instanceof Error ? error.message : error
    });
    return null;
  }
  if (!result.success && result.type) {
    const site = limitOf(result.type).site;
    if (site) {
      logHourly(`ceiling reached ${result.type}`, {
        limit: result.limit,
        resetsAt: new Date(result.reset * 1000).toISOString()
      });
    }
    countUsage(env, "limit", result.type, site ? "site" : "client");
  }
  return result;
}

/** The checks of one request to the account MCP server that is no tool call (initialize, a list, ping): the account's
    minute in this isolate, and its day once the isolate has answered its free two hundred of the day. Counts the
    request against the free ones, so call it once a request. */
export function mcpListLimits(env: LimitEnv, identifier: string): LimitCheck[] {
  const tally = tallyOf(memoryOf(env.RATE_LIMITER), "mcpListFree", identifier, Date.now());
  const free = countHere(tally, "mcpListFree", 1, env.DEPLOYMENT).success;
  return [[identifier, free ? "mcpList" : ["mcpList", "mcpListDaily"]]];
}
