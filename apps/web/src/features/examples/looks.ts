/* The looks a palette's examples page shows it in (ExamplesPage.tsx). The page is one for each palette, whatever its
   address names: each part of it shows the palette in a look of its own, which the palette's seed picks, so the page
   is the same each time it opens, from the looks the part is a good fit for by its own checks (fit.ts's, and the
   part's: words that read on its picture, a clock that reads on a screen, charts that stand out on their board). The
   parts take turns: each one looks first at the looks the parts before it took least, so the page shows the palette's
   range rather than one look again and again.
   A look is the palette as a gradient, bands across, bands swept round the middle (angular), rings out from it
   (radial), the fluted glass or the blob, at an angle and in as many bands as the seed picks for the part. The glass
   and the blob each lie at one angle a page, and the blob in its palette's shape (effect.ts's blobShapeOf), since each
   other angle or shape is another still for the server to write and the browser to draw. */
import { blobShapeOf, EFFECT_LOOK, EFFECT_PLAY, type EffectKind } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { DEFAULT_STEPS, type Style } from "@grabient/engine/view.ts";
import type { Shown } from "./paint.ts";

/** What a part shows the palette as. */
export type Look = "gradient" | "bands" | "sweep" | "rings" | EffectKind;
/** Every look, in the order a press on a tile turns through them. */
export const LOOKS: readonly Look[] = ["gradient", "bands", "glass", "sweep", "blob", "rings"];
/** The looks a stylesheet draws alone, which a page's first screen paints at once. */
export const CSS_LOOKS: readonly Look[] = ["gradient", "bands", "sweep", "rings"];

const STYLES: Readonly<Record<Exclude<Look, EffectKind>, Style>> = {
  gradient: "linearGradient",
  bands: "linearSwatches",
  sweep: "angularSwatches",
  rings: "radialSwatches"
};
/** The angles a look lies at: every eighth of a turn. */
export const ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;
/** As few bands as read as swatches, and as many as still read as bands, the palette's keyframes at least. */
const FEWEST_BANDS = 4;
const MOST_BANDS = 8;

/** A number from 0 up to 1 that a seed and a name give, the same on the server and in the browser: FNV-1a over both,
    then mixed (MurmurHash3's finalizer), so names a letter apart land apart. */
export function seeded(seed: string, name: string): number {
  let h = 0x811c9dc5;
  for (const c of `${seed}\u0000${name}`) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 2 ** 32;
}

/** Items in the order a seed shuffles them for a name (Fisher and Yates, each draw seeded). */
export function shuffled<T>(items: readonly T[], seed: string, name: string): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(seeded(seed, `${name}#${i}`) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The palette as its page holds it before any part takes a look: its own gradient across, at the default steps. */
export const plainOf = (seed: string, palette: Palette): Shown => ({
  seed,
  palette,
  effect: null,
  view: {
    style: "linearGradient",
    steps: Math.max(DEFAULT_STEPS, palette.anchors.length),
    angle: 90
  }
});

/** The look a palette is shown in. */
export const lookOf = (s: Shown): Look => {
  if (s.effect) return s.effect.kind;
  if (s.view.style === "linearSwatches") return "bands";
  if (s.view.style === "angularSwatches") return "sweep";
  if (s.view.style === "radialSwatches") return "rings";
  return "gradient";
};

/** The palette in a look as a part named `name` shows it: a gradient at the default steps, bands as many as the seed
    picks, each at an angle the seed picks for the part, or `turn` eighths of a turn on from it; rings, which have none,
    at the default's; the glass and the blob at the page's one angle for each, the blob in its palette's shape. */
export function inLook(seed: string, palette: Palette, look: Look, name: string, turn = 0): Shown {
  const keyframes = palette.anchors.length;
  const angleFor = (of: string, on = 0) =>
    ANGLES[(Math.floor(seeded(seed, `${of}:angle`) * ANGLES.length) + on) % ANGLES.length];
  if (look === "glass" || look === "blob")
    return {
      seed,
      palette,
      view: {
        style: "linearGradient",
        steps: Math.max(DEFAULT_STEPS, keyframes),
        angle: angleFor(look)
      },
      effect: {
        kind: look,
        ...EFFECT_PLAY,
        look: { ...EFFECT_LOOK, shape: look === "blob" ? blobShapeOf(seed) : null }
      }
    };
  const bands =
    FEWEST_BANDS + Math.floor(seeded(seed, `${name}:bands`) * (MOST_BANDS - FEWEST_BANDS + 1));
  return {
    seed,
    palette,
    effect: null,
    view: {
      style: STYLES[look],
      steps: Math.max(keyframes, look === "gradient" ? DEFAULT_STEPS : bands),
      angle: look === "rings" ? 90 : angleFor(name, turn)
    }
  };
}

/** How many times the parts so far took each look. */
export type Taken = Map<Look, number>;

/** The looks of `pool` in the order a part takes them: those the parts so far took least first, then in the order the
    seed shuffles them for the part; each at its angle, then, where the part tries `angles` of them, at the next eighths
    of a turn on (an effect's angle is the page's, and rings have none). */
function inOrder(
  seed: string,
  palette: Palette,
  name: string,
  pool: readonly Look[],
  taken: Taken,
  angles: number
) {
  const count = (look: Look) => taken.get(look) ?? 0;
  const turns = (look: Look) =>
    look === "gradient" || look === "bands" || look === "sweep" ? angles : 1;
  return shuffled(pool, seed, name)
    .map((look, i) => ({ look, i }))
    .sort((a, b) => count(a.look) - count(b.look) || a.i - b.i)
    .flatMap(({ look }) =>
      Array.from({ length: turns(look) }, (_, turn) => inLook(seed, palette, look, name, turn))
    );
}
const take = (taken: Taken, s: Shown) => {
  const look = lookOf(s);
  taken.set(look, (taken.get(look) ?? 0) + 1);
  return s;
};

/** A part's look where it is a good fit for one of `pool`: the first in the order it takes them (inOrder) that `fits`,
    counted in `taken`; null where none fits. */
export function pickFitting(
  seed: string,
  palette: Palette,
  name: string,
  pool: readonly Look[],
  fits: (s: Shown) => boolean,
  taken: Taken
): Shown | null {
  const found = inOrder(seed, palette, name, pool, taken, 1).find(fits);
  return found ? take(taken, found) : null;
}

/** A part's look: the first of `pool` in the order it takes them that `fits`, else the first, counted in `taken`. A
    part whose fit turns on the angle may try `angles` of them for each look. */
export function pickLook(
  seed: string,
  palette: Palette,
  name: string,
  pool: readonly Look[],
  fits: (s: Shown) => boolean,
  taken: Taken,
  angles = 1
): Shown {
  const order = inOrder(seed, palette, name, pool, taken, angles);
  return take(taken, order.find(fits) ?? order[0]);
}
