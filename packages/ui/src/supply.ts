/* What the water paints on a page that hands it no palette (a brand page, the 404): mostly random palettes, with about
   one in four drawn from the gallery's best, so the pages feel like the gallery without repeating it. */
import { decodePalette } from "@grabient/engine/codec.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { randomPalette } from "@grabient/engine/random.ts";

/** Twelve palettes from the first page of Popular. */
export const BRAND_SUPPLY: readonly string[] = [
  "kY4mpDazO-mUuu_fuLqXU49dvVP6",
  "kc-zpNeqM_WwiupeubyU06-8nTP_DzcBvUdAQ",
  "kamzkm1gtFdWRyrLHcJuB9B6KaQgOlEGg",
  "kWs2um4jE-G62O7xwb3bkk-4",
  "kSyQDAzZa8zgZxS",
  "kUzkiw66E-e4YQltnUXg",
  "kcgI_BPOBA0BgwZI1sK2LpDueoxrwLsS764_g",
  "kcERi8Fyy_zqWO_hlTGb7C9OA3va4rz2CA29A",
  "kW0B2lbAbMXISxv1E0NeJVCg",
  "kW1Dy4bJpCPCcxRwoMHbiQ_w",
  "kWxm745Do_WgvQBvGkHdZDG4",
  "kW0FBC2LM90Q3vExuj4JClAA"
];

/** The next palette to paint: one of `popular` a `share` of the time, never the same twice running, else a random one. */
export function brandSupply(
  popular: readonly string[],
  share = 0.25,
  rand: () => number = Math.random
): () => Palette {
  const liked = popular.map(seed => decodePalette(seed)).filter((p): p is Palette => !!p);
  let last = -1;
  return () => {
    if (liked.length && rand() < share) {
      let i = Math.floor(rand() * liked.length);
      if (liked.length > 1 && i === last) i = (i + 1) % liked.length;
      last = i;
      return liked[i];
    }
    last = -1;
    return randomPalette(rand);
  };
}
