/* The deploy's static files as the Worker reads them: through the ASSETS binding, and what it makes of them kept once
   per isolate. A failed read is not remembered, so the next request tries again. */
import type { Env } from "@grabient/server/env.ts";
import { madeOnce } from "@grabient/server/shared-work.ts";

export type AssetsEnv = Pick<Env, "ASSETS">;

/** A static file by its path. The binding reads the path alone; the host is one `vite dev` serves, which answers the
    binding from its own files and refuses a host it does not know. */
export async function asset(env: AssetsEnv, path: string): Promise<Response> {
  const response = await env.ASSETS.fetch(`http://assets.localhost${path}`);
  if (!response.ok) throw new Error(`${path} is missing`);
  return response;
}

/** What a load makes of the files, made once per isolate: kept by the binding, which an isolate keeps from request to
    request. A request that comes while another loads waits for it beside a timer of its own (madeOnce). */
export function once<T>(
  load: (env: AssetsEnv) => Promise<T>
): (env: AssetsEnv) => Promise<T | null> {
  const held = new WeakMap<Fetcher, () => Promise<T>>();
  return env => {
    let made = held.get(env.ASSETS);
    if (!made) {
      made = madeOnce(() => load(env));
      held.set(env.ASSETS, made);
    }
    return made().catch(() => null);
  };
}
