/* For the search's Node tests: the shipped search files read from disk, a D1 that shows every palette it is asked for
   the way G4's fixtures were made, the fixtures' fake embedder, and a limiter that refuses what it is told. */
import { readFileSync } from "node:fs";
import { fakeEmbedding } from "../../../../../packages/search/test/fake-embedding.ts";
import type { Env } from "../env.ts";

const PUBLIC = new URL("../../../public/search/", import.meta.url);

/** The ASSETS binding over public/search; `missing` files answer 404. Each call is a new binding, with caches of its own. */
export function assets(missing: readonly string[] = []): Fetcher {
  const fetch = async (input: RequestInfo | URL) => {
    const name =
      new URL(input instanceof Request ? input.url : String(input)).pathname.split("/").pop() ?? "";
    if (missing.includes(name)) return new Response(null, { status: 404 });
    try {
      return new Response(readFileSync(new URL(name, PUBLIC)));
    } catch {
      return new Response(null, { status: 404 });
    }
  };
  return { fetch } as unknown as Fetcher;
}

/** A shipped search file's bytes. */
export const searchFile = (name: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(name, PUBLIC)));

export const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8")) as T;

type View = { style: string; steps: number; angle: number };

/** A D1 that shows every palette asked of the gallery, drawn as `view` says, with no likes; every other read is empty. */
export function galleryDb(
  view: (seed: string) => View = () => ({ style: "linearGradient", steps: 7, angle: 90 })
): D1Database {
  const reads: string[] = [];
  const statement = (sql: string, values: unknown[] = []) => ({
    bind: (...bound: unknown[]) => statement(sql, bound),
    async all() {
      reads.push(sql);
      if (!/FROM k_palettes\s+WHERE seed IN/.test(sql)) return { results: [] };
      return {
        results: (values as string[]).map(seed => ({
          seed,
          ...view(seed),
          created_at: 1,
          likes_count: 0,
          rising: 0,
          rising_3m: 0,
          rising_1y: 0
        }))
      };
    },
    async first() {
      return null;
    },
    async run() {
      return { meta: {} };
    }
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: { all(): Promise<unknown> }[]) =>
      Promise.all(statements.map(s => s.all())),
    withSession: () => ({ prepare: (sql: string) => statement(sql) }),
    reads
  } as unknown as D1Database;
}

/** How many reads of the gallery a database made, by the number of seeds each asked for. */
export const galleryReads = (db: D1Database): number =>
  (db as unknown as { reads: string[] }).reads.filter(sql =>
    /FROM k_palettes\s+WHERE seed IN/.test(sql)
  ).length;

/** Workers AI with the fixtures' embedder, recording each call. */
export function fakeAi(calls: { model: string; texts: string[] }[] = []): Ai {
  const run = async (model: string, input: { text: string[] }) => {
    calls.push({ model, texts: input.text });
    return {
      data: input.text.map(text => fakeEmbedding(text, model.includes("gemma") ? 768 : 1024))
    };
  };
  return { run } as unknown as Ai;
}

/** A RateLimiter namespace that refuses these limits and allows the rest, recording what it was asked. */
export function refusing(refused: readonly string[], asked: string[] = []): DurableObjectNamespace {
  const fetch = async (input: RequestInfo | URL) => {
    const types = new URL(input instanceof Request ? input.url : String(input)).searchParams.getAll(
      "type"
    );
    asked.push(...types);
    const results = types.map(type => ({
      type,
      success: !refused.includes(type),
      limit: 1,
      remaining: 0,
      reset: 4102444800
    }));
    const failed = results.some(result => !result.success);
    return Response.json(
      { success: !failed, limit: 1, remaining: 0, reset: 4102444800, results },
      { status: failed ? 429 : 200 }
    );
  };
  return {
    idFromName: (name: string) => name,
    get: () => ({ fetch })
  } as unknown as DurableObjectNamespace;
}

/** The bindings a search reads, over the shipped files and the given database. */
export const searchEnv = (values: Partial<Env> = {}): Env =>
  ({
    DEPLOYMENT: "development",
    EMAIL_FROM: "",
    ASSETS: assets(),
    DB: galleryDb(),
    ...values
  }) as Env;
