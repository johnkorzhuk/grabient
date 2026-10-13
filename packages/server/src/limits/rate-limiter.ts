import { isLimitName, type LimitName, limitOf } from "./config.ts";

interface Stored {
  count: number;
  resetTime: number;
}

export interface Counted {
  type: LimitName;
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

/* One object per thing counted (an address, an account, an inbox, a site-wide key), named by limiterName, so its
   storage keys are the limits alone and nothing in it says who was counted. One request may count several windows of
   the same thing (an account's hour and day): every one takes it, or none does.

   Production's class has kept its counts in the key-value backend since grabient.com first deployed it, and a class
   keeps its backend for life, so this uses storage.get and storage.put alone. Keep the class and its name: removing or
   renaming it takes a class migration, which blocks every rollback past it. The request it answers is the one older
   deploys sent (`?type=…&type=…&n=…`), so a rollback finds the same counts and the same protocol. */
export class RateLimiter {
  readonly #storage: DurableObjectStorage;
  readonly #deployment: string | undefined;

  constructor(state: DurableObjectState, env: { DEPLOYMENT?: string }) {
    this.#storage = state.storage;
    this.#deployment = env.DEPLOYMENT;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const names = [...new Set(url.searchParams.getAll("type"))];
    const n = Math.min(
      100_000,
      Math.max(1, Math.floor(Number(url.searchParams.get("n") ?? 1)) || 1)
    );
    if (!names.length || !names.every(isLimitName)) {
      return new Response("Missing or invalid rate-limit parameters", { status: 400 });
    }
    const results = await this.#take(names, n);
    const refused = results.find(result => !result.success);
    const head = refused ?? results[0]!;
    return Response.json(
      {
        success: !refused,
        limit: head.limit,
        remaining: head.remaining,
        reset: head.reset,
        results
      },
      { status: refused ? 429 : 200 }
    );
  }

  async #take(names: LimitName[], n: number): Promise<Counted[]> {
    const now = Date.now();
    const stored = await this.#storage.get<Stored>(names);
    const next: Record<string, Stored> = {};
    const results = names.map((type): Counted => {
      const { requests: limit, window } = limitOf(type, this.#deployment);
      const held = stored.get(type);
      const live = held && now <= held.resetTime ? held : undefined;
      const count = live?.count ?? 0;
      const resetTime = live?.resetTime ?? now + window * 1000;
      const reset = Math.floor(resetTime / 1000);
      if (count + n > limit) {
        return { type, success: false, limit, remaining: Math.max(0, limit - count), reset };
      }
      next[type] = { count: count + n, resetTime };
      return { type, success: true, limit, remaining: limit - count - n, reset };
    });
    // A refusal writes nothing: the request took nothing.
    if (results.every(result => result.success)) await this.#storage.put(next);
    return results;
  }
}
