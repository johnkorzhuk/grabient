/* The looks a palette's examples page shows it in (ExamplesPage.tsx). The page is one for each palette, whatever its
   address names: each part of it shows the palette in a look of its own, which the palette's seed picks, so the page
   is the same each time it opens, from the looks the part is a good fit for by its own checks (fit.ts's, and the
   part's: words that read on its picture, a clock that reads on a screen, charts that stand out on their board). The
   parts take turns: each one looks first at the looks the parts before it took least, so the page shows the palette's
   range rather than one look again and again.
   A look is the palette as a gradient, bands across, bands swept round the middle (angular), rings out from it
   (radial), or one of the effects (effect.ts's EFFECTS), at an angle and in as many bands as the seed picks for the
   part. Each effect but the blob lies at one angle a page, as designed, and the
   blob in its palette's shape (effect.ts's blobShapeOf), since each other angle or shape is another still for the
   server to write and the browser to draw; the blob has no angle, its palette lying from left to right. A part that
   shows a picture of the palette (the hero, the cards' media, the profile and the wallpapers) finishes its looks as
   the seed picks, soft, grained, both or neither (finished). */
import { AURORA_PATH_KINDS, auroraMadePath } from "@grabient/engine/aurora-path-kinds.ts";
import { sampleLCH } from "@grabient/engine/curve.ts";
import {
  blobShapeOf,
  EFFECT_KINDS,
  EFFECT_LOOK,
  EFFECT_PLAY,
  type EffectKind,
  effectFinish,
  effectPath,
  effectSteps,
  effectZoom,
  isEffect,
  SHAPE_MAX,
  takesShape
} from "@grabient/engine/effect.ts";
import { KIT_KINDS } from "@grabient/engine/kit/kinds.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { DEFAULT_ANGLE, DEFAULT_STEPS, type Style, type View } from "@grabient/engine/view.ts";
import type { Shown } from "./paint.ts";

/** What a part shows the palette as. */
export type Look = "gradient" | "bands" | "sweep" | "rings" | EffectKind;
/** Every look, in the order a press on a tile turns through them: a stylesheet's and an effect's in turn. */
export const LOOKS: readonly Look[] = [
  "gradient",
  "glass",
  "bands",
  "silk",
  "sweep",
  "rosette",
  "rings",
  "papercut",
  "blob",
  "strings",
  "dimple",
  "aurora",
  ...KIT_KINDS
];
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

/** The most a gradient's blends may stray from the palette's curve, in OKLab: about half of what an eye tells apart. */
const SAG = 0.01;
/** The most steps a gradient takes. */
const MOST_STEPS = 48;
/** A point of the curve in OKLab. */
const labAt = (P: Palette, t: number) => {
  const [L, C, H] = sampleLCH(P, t);
  return [L, C * Math.cos((H * Math.PI) / 180), C * Math.sin((H * Math.PI) / 180)];
};
/** How far the palette's curve strays from the straight blends between `n` even stops of it, the most anywhere: a
    curve that turns between two stops is drawn as a corner there, and a hue that turns fast as stripes. */
function sagAt(P: Palette, n: number): number {
  let most = 0;
  for (let i = 0; i < n - 1; i++) {
    const a = labAt(P, i / (n - 1));
    const b = labAt(P, (i + 1) / (n - 1));
    for (let k = 1; k < 4; k++) {
      const u = k / 4;
      const on = labAt(P, (i + u) / (n - 1));
      most = Math.max(most, Math.hypot(...on.map((v, j) => v - (a[j] + (b[j] - a[j]) * u))));
    }
  }
  return most;
}
/* the steps each palette's gradient takes, worked out once */
const smooth = new WeakMap<Palette, number>();
/** The steps a gradient of the palette takes: the fewest from the default up whose blends follow its curve within
    SAG, so a palette whose hue turns fast takes more and shows no stripes, and its keyframes at least. */
export function smoothSteps(P: Palette): number {
  let steps = smooth.get(P);
  if (steps === undefined) {
    steps = DEFAULT_STEPS;
    while (steps < MOST_STEPS && sagAt(P, steps) > SAG)
      steps = Math.min(MOST_STEPS, Math.ceil(steps * 1.25));
    steps = Math.max(steps, P.anchors.length);
    smooth.set(P, steps);
  }
  return steps;
}

/** The palette as its page holds it before any part takes a look: its own gradient across, as smooth as it needs. */
export const plainOf = (seed: string, palette: Palette): Shown => ({
  seed,
  palette,
  effect: null,
  view: { style: "linearGradient", steps: smoothSteps(palette), angle: 90 }
});

/** The look a palette is shown in. */
export const lookOf = (s: Shown): Look => {
  if (s.effect) return s.effect.kind;
  if (s.view.style === "linearSwatches") return "bands";
  if (s.view.style === "angularSwatches") return "sweep";
  if (s.view.style === "radialSwatches") return "rings";
  return "gradient";
};

/** The soft and the grain a part's looks may take, each at a strength the seed picks: a soft that melts a gradient's
    bands and rounds its turns along its line, or blurs an effect by a share of its box over its palette's gradient,
    gentler, where a little goes a long way (soft 32 blurs a screen-wide picture by 14 pixels); and film grain over the
    picture, light enough to read as texture. */
const SOFTS = { line: [40, 56, 72], effect: [12, 20, 28] } as const;
const GRAINS = [16, 24, 32] as const;
/** The rosette's own finish, which it takes three times in four (John, 3 Nov 2026: "for the rosette i like a bit of
    blur and grain in there. make that to go to for the examples page, but it doesnt always have to be that"): a little
    soft and a little grain, each at a strength the seed picks; the other times, any finish as another effect takes. */
const ROSETTE = { share: 0.75, softs: [20, 28], grains: [16, 24] } as const;
/** The finish the seed picks for a part named `name`, its soft as strong as suits a gradient or the effect `kind`
    plays: half the parts take none, so the page shows its palette plain as well as finished; of the rest, a soft, a
    grain or both, about two, two and one in five. The rosette mostly takes its own (ROSETTE). */
export function finishFor(
  seed: string,
  name: string,
  kind: EffectKind | null
): Pick<View, "soft" | "grain"> {
  let pick = seeded(seed, `${name}:finish`);
  const strength = (list: readonly number[], of: string) =>
    list[Math.floor(seeded(seed, `${name}:${of}`) * list.length)];
  if (kind === "rosette") {
    if (pick < ROSETTE.share)
      return { soft: strength(ROSETTE.softs, "soft"), grain: strength(ROSETTE.grains, "grain") };
    pick = (pick - ROSETTE.share) / (1 - ROSETTE.share);
  }
  const softs = kind ? SOFTS.effect : SOFTS.line;
  if (pick < 0.5) return {};
  if (pick < 0.7) return { soft: strength(softs, "soft") };
  if (pick < 0.9) return { grain: strength(GRAINS, "grain") };
  return { soft: strength(softs, "soft"), grain: strength(GRAINS, "grain") };
}
/** A look finished as the seed picks for the part named `name` (finishFor), with no soft where its effect takes none
    (the blob). */
export function finished(s: Shown, name: string): Shown {
  const finish = finishFor(s.seed, name, s.effect?.kind ?? null);
  return {
    ...s,
    view: { ...s.view, ...(s.effect ? effectFinish(s.effect.kind, finish) : finish) }
  };
}

/** The palette in a look as a part named `name` shows it: a gradient as smooth as it needs, bands as many as the seed
    picks, each at an angle the seed picks for the part, or `turn` eighths of a turn on from it; rings and the blob,
    which have none, at the default's. An effect lies at the page's one angle for it, as designed, and the blob in its
    palette's shape; or, given `own`, in a shape of its own (a zoom of its own where it takes one in its shape's place:
    the dimple's; a path of its own where it takes one there: the aurora's range, of a kind and a number the seed
    picks), at an angle of its own too, and in steps of its own where it takes them (the sandstone's bands, within
    their range), as a look a reader turns to is. */
export function inLook(
  seed: string,
  palette: Palette,
  look: Look,
  name: string,
  turn = 0,
  own?: string
): Shown {
  const keyframes = palette.anchors.length;
  const angleFor = (of: string, on = 0) =>
    ANGLES[(Math.floor(seeded(seed, `${of}:angle`) * ANGLES.length) + on) % ANGLES.length];
  if (isEffect(look)) {
    const shape = !takesShape(look)
      ? null
      : own
        ? Math.floor(seeded(seed, `${own}:shape`) * (SHAPE_MAX + 1))
        : look === "blob"
          ? blobShapeOf(seed)
          : null;
    /* a zoom in a tenth's steps, as the menu's arrows step it */
    const zooms = EFFECT_KINDS[look].zoom;
    const zoom =
      own && zooms
        ? effectZoom(
            look,
            zooms.least +
              Math.floor(seeded(seed, `${own}:zoom`) * ((zooms.most - zooms.least) * 10 + 1)) / 10
          )
        : null;
    /* a range of a kind and a number, as the menu's press makes one */
    const path =
      own && EFFECT_KINDS[look].path
        ? effectPath(
            look,
            auroraMadePath(
              AURORA_PATH_KINDS[
                Math.floor(seeded(seed, `${own}:path-kind`) * AURORA_PATH_KINDS.length)
              ],
              1 + Math.floor(seeded(seed, `${own}:path`) * 999)
            )
          )
        : null;
    const range = EFFECT_KINDS[look].steps;
    const steps =
      own && range
        ? effectSteps(
            look,
            range.least + Math.floor(seeded(seed, `${own}:steps`) * (range.most - range.least + 1))
          )
        : null;
    return {
      seed,
      palette,
      view: {
        style: "linearGradient",
        steps: Math.max(DEFAULT_STEPS, keyframes),
        angle: look === "blob" ? DEFAULT_ANGLE : angleFor(own ?? look)
      },
      effect: { kind: look, ...EFFECT_PLAY, look: { ...EFFECT_LOOK, shape, steps, zoom, path } }
    };
  }
  const bands =
    FEWEST_BANDS + Math.floor(seeded(seed, `${name}:bands`) * (MOST_BANDS - FEWEST_BANDS + 1));
  return {
    seed,
    palette,
    effect: null,
    view: {
      style: STYLES[look],
      steps: look === "gradient" ? smoothSteps(palette) : Math.max(keyframes, bands),
      angle: look === "rings" ? 90 : angleFor(name, turn)
    }
  };
}

/** How many times the parts so far took each look. */
export type Taken = Map<Look, number>;

/** The looks of `pool` in the order a part takes them: those the parts so far took least first, then in the order the
    seed shuffles them for the part; each at its angle, then, where the part tries `angles` of them, at the next eighths
    of a turn on (an effect's angle is the page's, and rings have none); each finished as the part's are, where it
    takes a finish. */
function inOrder(
  seed: string,
  palette: Palette,
  name: string,
  pool: readonly Look[],
  taken: Taken,
  angles: number,
  variant = 0,
  finish = false
) {
  const count = (look: Look) => taken.get(look) ?? 0;
  const turns = (look: Look) =>
    look === "gradient" || look === "bands" || look === "sweep" ? angles : 1;
  return shuffled(pool, seed, name)
    .map((look, i) => ({ look, i }))
    .sort((a, b) => count(a.look) - count(b.look) || a.i - b.i)
    .flatMap(({ look }) =>
      Array.from({ length: turns(look) }, (_, turn) => {
        const s = inLook(
          seed,
          palette,
          look,
          name,
          turn,
          variant ? `${look}~${variant}` : undefined
        );
        return finish ? finished(s, name) : s;
      })
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
  taken: Taken,
  variant = 0
): Shown | null {
  const found = inOrder(seed, palette, name, pool, taken, 1, variant).find(fits);
  return found ? take(taken, found) : null;
}

/** A part's look: the first of `pool` in the order it takes them that `fits`, else the first, counted in `taken`. A
    part whose fit turns on the angle may try `angles` of them for each look. A `variant` past 0, a set of looks a reader
    turned to, gives its effects an angle and a shape of that set's own. A part that takes a `finish` has its looks
    finished as the seed picks for it, and checked so. */
export function pickLook(
  seed: string,
  palette: Palette,
  name: string,
  pool: readonly Look[],
  fits: (s: Shown) => boolean,
  taken: Taken,
  angles = 1,
  variant = 0,
  finish = false
): Shown {
  const order = inOrder(seed, palette, name, pool, taken, angles, variant, finish);
  return take(taken, order.find(fits) ?? order[0]);
}

/** How many looks a reader turns a part through before they come round again, at most. */
const MOST_LOOKS = 24;
/** What tells two looks apart: the look, its steps, its angle, an effect's shape, steps, zoom and path, and its soft
    and grain. */
const lookKey = (s: Shown) =>
  [
    lookOf(s),
    s.view.steps,
    s.view.angle,
    s.effect?.look.shape ?? "",
    s.effect?.look.steps ?? "",
    s.effect?.look.zoom ?? "",
    s.effect?.look.path ?? "",
    s.view.soft ?? 0,
    s.view.grain ?? 0
  ].join("|");
/** The looks a reader turns a part through, in order: the one the page gave it first, then rounds of the looks of
    `pool` in the order the seed shuffles them for the part, each round at an angle, as many bands and an effect's
    shape of its own, and a finish of its own where the part takes one, each look a good fit for the part and unlike
    every one before it; MOST_LOOKS at most. */
export function looksFor(
  first: Shown,
  name: string,
  pool: readonly Look[],
  fits: (s: Shown) => boolean,
  finish = false
): Shown[] {
  const { seed, palette } = first;
  const out = [first];
  const seen = new Set([lookKey(first)]);
  const order = shuffled(pool, seed, `${name}~order`);
  for (let round = 1; round <= MOST_LOOKS && out.length < MOST_LOOKS; round++)
    for (const look of order) {
      const own = `${name}~${round}~${look}`;
      const plain = inLook(seed, palette, look, own, 0, own);
      const s = finish ? finished(plain, own) : plain;
      const key = lookKey(s);
      if (seen.has(key) || !fits(s)) continue;
      seen.add(key);
      out.push(s);
      if (out.length === MOST_LOOKS) break;
    }
  return out;
}
