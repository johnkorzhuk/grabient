/* The precise names the Worker's swatch files give colors: the file the build writes (scripts/color-names.ts), read
   through the ASSETS binding once per isolate. Where it can't be read, a file names its colors with the broad names. */
import { type Namer, preciseNamer } from "@grabient/engine/precise-names.ts";
import type { Env } from "@grabient/server/env.ts";
import { asset, once } from "../assets.ts";

const read = once(async env => preciseNamer(await (await asset(env, __COLOR_NAMES__)).text()));

/** The precise names, or null where the deploy has none to read. */
export const colorNames = (env: Partial<Pick<Env, "ASSETS">>): Promise<Namer | null> =>
  env.ASSETS ? read({ ASSETS: env.ASSETS }) : Promise.resolve(null);
