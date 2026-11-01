/* The look of a palette's examples page's hero (ExamplesPage.tsx), which the page's route works out on the server too,
   for its share card and the frame's bar: a module of its own, which the route loads as its data loads, so no page's
   start carries the examples. */
import type { Palette } from "@grabient/engine/palette.ts";
import { ANGLES, CSS_LOOKS, pickLook, plainOf, type Taken } from "./looks.ts";
import type { Shown } from "./paint.ts";
import { wordsTone } from "./tone.ts";

/** The hero's look: of the looks a stylesheet draws alone, the seed's pick of those the hero's words read on, each
    tried at every angle, as the words cover much of the picture. */
export const heroIn = (base: Shown, taken: Taken): Shown =>
  pickLook(
    base.seed,
    base.palette,
    "hero",
    CSS_LOOKS,
    s => wordsTone(s) !== null,
    taken,
    ANGLES.length
  );

/** The hero's view for a palette, which its share card and the frame's bar wear. */
export const heroView = (seed: string, palette: Palette) =>
  heroIn(plainOf(seed, palette), new Map()).view;
