/* The palette a file's name leads to, as its page's address does: an old grabient.com id through the migration maps
   (as it is, or an lz-string id as its `_` form), then the name itself, decoded and written again canonical. A request
   never fits an old palette; one the maps lack leads nowhere. Server only: the maps never reach the browser. */
import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { legacyTarget } from "@grabient/engine/legacy.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import migrated from "../../../data/legacy-k.json" with { type: "json" };
import links from "../../../data/legacy-links.json" with { type: "json" };

const maps: readonly Readonly<Record<string, string>>[] = [migrated, links];
const mapped = (id: string) => maps.find(map => Object.hasOwn(map, id))?.[id];

export interface Resolved {
  seed: string;
  palette: Palette;
}

export function resolvePalette(name: string): Resolved | null {
  const found = decodePalette(legacyTarget(name, mapped)?.seed ?? name);
  if (!found) return null;
  const seed = encodePalette(found);
  const palette = decodePalette(seed);
  return palette && { seed, palette };
}
