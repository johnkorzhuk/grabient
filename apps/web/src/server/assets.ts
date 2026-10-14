/* The deploy's static files as the Worker reads them: through the ASSETS binding, and what it makes of them kept once
   per isolate. A failed read is not remembered, so the next request tries again. */
import type { Env } from "@grabient/server/env.ts";

export type AssetsEnv = Pick<Env, "ASSETS">;

/** A static file by its path. The binding reads the path alone; the host is one `vite dev` serves, which answers the
    binding from its own files and refuses a host it does not know. */
export async function asset(env: AssetsEnv, path: string): Promise<Response> {
  const response = await env.ASSETS.fetch(`http://assets.localhost${path}`);
  if (!response.ok) throw new Error(`${path} is missing`);
  return response;
}

/** What a load makes of the files, made once per isolate: kept by the binding, which an isolate keeps from request to
    request. */
export function once<T>(
  load: (env: AssetsEnv) => Promise<T>
): (env: AssetsEnv) => Promise<T | null> {
  const held = new WeakMap<Fetcher, Promise<T | null>>();
  return env => {
    let loading = held.get(env.ASSETS);
    if (!loading) {
      loading = load(env).catch(() => {
        held.delete(env.ASSETS);
        return null;
      });
      held.set(env.ASSETS, loading);
    }
    return loading;
  };
}
