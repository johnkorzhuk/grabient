import { decodePalette } from "@grabient/engine/codec.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { createBarCycle } from "@grabient/ui/barcycle.ts";
import { lchSamples, mixStops, toHexes } from "@grabient/ui/bartween.ts";
import { BRAND_SUPPLY } from "@grabient/ui/supply.ts";
import { type Accessor, createSignal } from "solid-js";

/* The colors the frame shows: the wordmark's bar, the water behind the page and every field's rim, which wear the bar.
   On a page with palettes the bar cycles through them (createBarCycle) and the water carries what the bar shows. With
   none, the water paints itself from its own supply and the bar mirrors it, a window on the water once it is drawn. A
   palette a brand page hands in (About's figure) arrives from the water's colors in one move and is then held as it
   changes; the editor's is held from its first frame, its page opening on it. */

/** The bar's samples. */
const N = 32;
/** How long a brand page's palette takes to arrive from the water's colors, in seconds. */
const ARRIVE = 1.2;

/** The bar before anything is drawn: the same on the server and in the browser, so the first paint hydrates. */
export const RESTING: readonly string[] = sampleStops(decodePalette(BRAND_SUPPLY[0])!, N).map(
  stop => stop.hex
);

export function createWater(input: {
  /** the palettes on screen, as their colors */
  palettes: Accessor<readonly (readonly string[])[]>;
  /** a brand page: its palette arrives from the water's colors before it is held */
  brand: Accessor<boolean>;
}) {
  /* what the water says it paints, which the bar mirrors while the page has no palettes */
  const [ink, setInk] = createSignal<readonly string[]>(RESTING);
  /* true once the water is drawn, false where it cannot be, null while the page has taken it away */
  const [lit, setLit] = createSignal<boolean | null>(null);
  const supplied = () => !input.palettes().length;
  /* one palette is held: a cycle of one would still move every few seconds */
  const held = () => (input.palettes().length === 1 ? input.palettes()[0] : null);
  /* read by the bar's own frame loop, which times the arrival */
  let arrival: { from: ReturnType<typeof lchSamples>; at: number } | null = null;
  const follow = (): readonly string[] | null => {
    if (supplied()) {
      arrival = null;
      return ink();
    }
    const palette = held();
    if (!palette || !input.brand()) {
      arrival = null;
      return palette;
    }
    const now = performance.now() / 1000;
    arrival ??= { from: lchSamples(ink(), N), at: now };
    const u = (now - arrival.at) / ARRIVE;
    return u >= 1
      ? palette
      : toHexes(mixStops(arrival.from, lchSamples(palette, N), u, "sweep", 1));
  };
  const bar = createBarCycle(input.palettes, { n: N, follow });
  const cycle = () => (bar().length ? bar() : RESTING);
  return {
    lit,
    setLit,
    setInk,
    supplied,
    /** what the water is to paint, or nothing where it paints itself */
    paint: () => (supplied() ? undefined : cycle),
    /** the bar's colors: the cycle, or the water's own */
    light: () => (supplied() ? ink() : cycle())
  };
}
