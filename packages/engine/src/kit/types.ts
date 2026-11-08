/* Field effects: the kit a new effect is made from (kit/README.md). An effect is a smooth field over the plane, its
   kernel, which the effect's author writes once in the kernel subset (compile.ts reads it) and every format runs: the
   CPU drawing (render.ts), the player's GLSL, the WebGPU page's WGSL and the clips' C. Its picture is the field's
   levels drawn as a stack of sheets, each a palette color, each casting a shadow on the sheets below and showing a lit
   rim toward the light, with lines along other levels over them: shapes an SVG fills exactly, so any frame is a plain
   SVG of its own and Copy for Figma pastes its layers. What an author writes is a FieldEffect; everything else is the
   kit's. */

/** A phase that swings about its rest: rest + swing * sin(2 pi cycles t / loop + psi), in radians, reduced to one turn
    before any format reads it, so a kernel reads a phase only inside sin or cos. `cycles` is a whole number, so every
    phase ends the loop where it began. */
export interface Track {
  rest: number;
  swing: number;
  cycles: number;
  psi: number;
}

/** The constants a kernel reads by name, each a list as long as its effect's `uniforms` says. */
export type KernelU = Readonly<Record<string, ArrayLike<number>>>;

/** The field at (x, y): D units in the design's own frame (the view's angle already turned out of it, so x runs along
    the angle and y across it), from its constants U and the frame's phases F. A plain function in the kernel subset
    (kit/README.md): numbers, Math's sin, cos, sqrt, exp, log, atan2, abs, floor, ceil, min, max, loops of a constant
    count, no allocation, no other state. */
export type FieldKernel = (x: number, y: number, U: KernelU, F: ArrayLike<number>) => number;

/** What a shape's seed draws: the kernel's constants (each list exactly as long as `uniforms` says, every number
    rounded with kitRound so every format writes the same design) and its phases' tracks (exactly `tracks` of them). */
export interface FieldDesign {
  U: Readonly<Record<string, readonly number[]>>;
  tracks: readonly Track[];
}

/** How the palette colors a run of levels: level k takes the palette at u = k * hop + offset, held in 0..1 (clamp),
    its fraction (cycle), or there and back, 0 to 1 to 0 every 2 (mirror). */
export interface ColorMap {
  hop: number;
  offset: number;
  wrap: "clamp" | "cycle" | "mirror";
}

/** The drop shadow each sheet casts on those below: a copy of the sheet moved `distance` D units toward `angle`
    (degrees on the screen: 0 right, 90 down), the shadow's color at `alpha` over what lies below; the light swings
    `swing` degrees each way about there, once a loop (0: it holds). */
export interface ShadowRecipe {
  angle: number;
  distance: number;
  alpha: number;
  swing: number;
  /** a soft shadow: drawn as `steps` layers (1 to 4; 1 where left out), layer i the sheet's own level raised
      i / (steps - 1) of `spread` (0 to 1, a share of the sheets' step), each at alpha / steps. It fades out from under
      its sheet over that share of the way to the next level, as a blur fades, and a small island, whose top the raised
      levels miss, casts a fainter one, as a blurred island does; it costs the shading nothing, the SVG a path a layer */
  steps?: number;
  spread?: number;
  /** the shadow's color: "ink", the palette's darkest hue near black (where left out); or "below", the sheet it falls
      on darkened, its color times `depth` in each channel (0 to 1, 0.55 where left out), so a shadow deepens the paper
      it lies on rather than greying it: sheet k's shadow takes sheet k - 1's color, the first sheet's the ground's */
  tint?: "ink" | "below";
  depth?: number;
}

/** A lit rim: a copy of each sheet moved `distance` D units toward the light (against the shadow), white at `alpha`,
    peeking out from under the sheet along its edge that faces the light. Keep it a pixel or two at the design's size:
    it is drawn only next to the pixel's own sheets. */
export interface RimRecipe {
  distance: number;
  alpha: number;
  /** the rim's color: "white" (where left out), or "own", the sheet's own color lifted `lift` of the way to white
      (0 to 1, 0.4 where left out), so a lit edge is its paper in the light rather than a white line */
  tint?: "white" | "own";
  lift?: number;
}

/** The stack: sheet k is where the field is at least base + k * step, for k from 0 to count - 1, or for every whole k
    where count is null (the levels run on as stripes, and the ground never shows). Each sheet lies over the ones
    before it, its shadow and its rim under it. */
export interface SheetsRecipe {
  base: number;
  step: number;
  count: number | null;
  colors: ColorMap;
  shadow: ShadowRecipe | null;
  rim: RimRecipe | null;
}

/** Lines over the sheets: line j is the band where the field lies within `half` of base + j * step, for every whole j,
    so a line thins where the field steepens and swells where it flattens, as an engraver's does. Its color is the
    palette's by the map, or the palette's lightest or darkest color, at `alpha`. */
export interface LinesRecipe {
  base: number;
  step: number;
  half: number;
  colors: ColorMap | "lightest" | "darkest";
  alpha: number;
}

/** The ground under the sheets: the palette's darkest color, its OKLab lightness times `lightness` and at most `bound`,
    or its lightest, its distance from white times `lightness` and its lightness at least `bound`; its chroma times
    `chroma`. Each palette color the sheets and lines take is moved `lift` in lightness away from it where it would
    sink into it (0: none). */
export interface GroundRecipe {
  pick: "darkest" | "lightest";
  lightness: number;
  bound: number;
  chroma: number;
  lift: number;
}

/** What the site says of a field effect in English, where its files, clips, code and shaders say what they show (its
    name on the menu and its words in a title are kit/names.ts's, which a page translates). */
export interface FieldAbout {
  /** what its SVG shows, as a link preview says it after "An SVG of a Grabient palette: ": "its colors as ..." */
  shows: string;
  /** its clip as a link preview says it: "A looping video of a Grabient palette: ..." */
  video: string;
  /** the lead of a palette's Markdown at its address, one sentence: "{name} played as ...", where {name} is the
      palette's title and {colors} the colors it draws, listed */
  describe: string;
  /** what its shader texts are, the credit's last line before how each is drawn: "the ..., the palette as ..." */
  what: string;
}

/** How the view's steps space a field effect's levels, for one that takes them (the Appearance menu's Steps field,
    `steps=` in an address, as a gradient's): `least` to `most`, whole numbers, `designed` where the view names none.
    With n steps every level comes n / designed times as close (its sheets' step and its lines' times designed / n) and
    each level's color steps designed / n times as far along the palette (each map's hop the same), so the palette's
    sweep across a box stays and only the bands' width changes: at the designed steps every number is the recipe's
    (kit/scene.ts kitScene). Its range is what kit-check.ts passes at both ends: crowding and the still's bytes at
    `most`, the motion at `least`. */
export interface KitSteps {
  least: number;
  most: number;
  designed: number;
}

/** A field effect, all its author writes: its loop, its scale, its designed look, its kernel and its design, how its
    levels are drawn, and what the site says of it. */
export interface FieldEffect {
  /** its name in the address (style=), lower case letters */
  kind: string;
  about: FieldAbout;
  /** seconds a loop lasts at speed 1: every track makes whole cycles in it */
  loop: number;
  /** D over the box's longer side: every box shows the one design its longer side frames, centered (0.75 as the
      papercut's and the strings') */
  span: number;
  /** the seed shape 0 (as designed) draws, past every shape an address names: picked from a run of seeds and said why */
  designedSeed: number;
  /** the kernel's constants: each name and its list's length */
  uniforms: Readonly<Record<string, number>>;
  /** how many phases a frame sets */
  tracks: number;
  /** the design a seed draws: deterministic, seeded by kitRng */
  design(seed: number): FieldDesign;
  /** the field */
  field: FieldKernel;
  ground: GroundRecipe;
  sheets: SheetsRecipe | null;
  lines: LinesRecipe | null;
  /** the view's steps it takes as its levels' density (KitSteps), the recipe's steps and hops its designed steps'; none
      for an effect whose levels the view's steps leave alone, as every effect's were before the sandstone's */
  steps?: KitSteps;
  /** what a pixel of its clips costs against the glass's (video.ts VIDEO_WEIGHT), as test/kit-weight.ts measured it:
      the most its frames measured, rounded up, and the kernel's cost then (kit-gen's). Absent, or with the kernel's
      cost since changed, kitVideoWeight works it out from the kernel's cost and the recipe, which counts every
      kernel's costliest path and so weighs most kernels more than they measure */
  clipWeight?: { weight: number; cost: number };
}

/** What every format's frame of a field effect is set by besides its scene: the phases, then the shadow's move and the
    rim's (screen D units), into one list of kitFrameSize numbers. */
export const kitFrameSize = (def: FieldEffect): number => def.tracks + 4;
