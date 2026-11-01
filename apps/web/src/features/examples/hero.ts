/* The look of a palette's examples page's hero (ExamplesPage.tsx), which the page's route works out too, for its share
   card and the frame's bar: the hero plays one of the effects, the one its seed puts first, so its code shows how a page
   plays one behind it, the first frame inline and the palette's script from its address. A module of its own, which
   the route loads as its data loads, so no page's start carries the examples. */
import type { Palette } from "@grabient/engine/palette.ts";
import { inLook, type Look, shuffled } from "./looks.ts";
import type { Shown } from "./paint.ts";

/** The looks the hero plays. */
const HERO_LOOKS: readonly Look[] = ["glass", "blob"];

/** The hero's look for a palette: the effect its seed puts first. */
export const heroOf = (seed: string, palette: Palette): Shown =>
  inLook(seed, palette, shuffled(HERO_LOOKS, seed, "hero")[0], "hero");
