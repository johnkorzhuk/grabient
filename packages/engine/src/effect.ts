/* The effects a palette's picture can play instead of a gradient: the fluted glass (glass.ts) and the blob (blob.ts).
   An effect rides the palette's address as `style=glass` or `style=blob`, then for the glass the view's `angle`, which
   turns its ribs (the blob has none: its palette lies from left to right), then how it plays: `speed` (the loop's pace, 1 as designed, 0 its
   first frame held with no motion) and `fps` (frames a second at most: 60 unless it says, up to 120 where a screen
   shows that many), then its look: `shape`, a number from 0 to 999 that picks the blobs' forms and wanderings or the
   glass's ribs and the colors drifting behind them (the dimple has none, and `zoom` in its place: how much larger
   than designed it is drawn, 1 to 4, none as designed; the aurora has none, and `path` in its place: its range's
   outline, written as aurora-path.ts says, none as designed), the blob's `frost`, and `bg`, the ground of an effect
   that takes one (EFFECT_KINDS' `ground`: the blob's, the strings' and the aurora's range): any CSS color, which an
   address keeps as hex (the Worker writes any other spelling as hex, css-color.ts), none leaving the blob and the
   aurora's range clear and the strings on their designed ground.
   The gradient's steps leave the address while an effect plays, so an address says only what its picture shows (the
   editor keeps them to give back), but for an effect that takes steps of its own (EFFECT_KINDS' `steps`: the
   sandstone's bands), whose `steps` are its look's, its range's, and none at its designed number. */
import { auroraPath } from "./aurora-path.ts";
import { KIT_STEPS } from "./kit/gen/kind-steps.ts";
import { KIT_KINDS, type KitKind, kitRecord } from "./kit/kinds.ts";
import { KIT_WORDS } from "./kit/names.ts";
import type { KitSteps } from "./kit/types.ts";
import { clamp } from "./math.ts";
import { msg } from "./message.ts";
import type { Palette } from "./palette.ts";
import {
  DEFAULT_ANGLE,
  drawnView,
  finishOf,
  finishParts,
  type ParamReader,
  type Size,
  type View
} from "./view.ts";

/** A view's soft and grain, which an effect's address names after its angle, as the editor's does (seedAddress): the
    effect blurred over its palette's gradient and the grain over it (fx-finish.ts). */
export type EffectFinish = Pick<View, "soft" | "grain">;

/** Every effect: the eight drawn by code of their own, then the field effects (kit/kinds.ts), each a file of the kit's. */
export const EFFECTS = [
  "glass",
  "blob",
  "silk",
  "rosette",
  "papercut",
  "strings",
  "dimple",
  "aurora",
  ...KIT_KINDS
] as const;
export type EffectKind = (typeof EFFECTS)[number];
export const isEffect = (value: unknown): value is EffectKind =>
  typeof value === "string" && (EFFECTS as readonly string[]).includes(value);

/** The range of the view's steps an effect takes as its own (the sandstone's bands), least to most, and the number it
    was designed at, which an address leaves out (kit/types.ts KitSteps). */
export type EffectSteps = KitSteps;

/** The range of zoom an effect takes (the dimple's), least to most, and the zoom it was designed at, which an address
    leaves out: how much larger than designed its picture is drawn, kept to two decimals. */
export interface EffectZoom {
  least: number;
  most: number;
  designed: number;
}

/** What an effect's look's `bg` is where its address names none: "clear", the page through it (the blob's), or
    "designed", the ground it was designed on (the strings' deep ground, the palette's darkest color made deeper). */
export type EffectGround = "clear" | "designed";

/** The forms an effect can fall short in, each said why where it does (effect-why.ts). */
export type EffectShortfall = "svgMotion" | "frameSvg" | "figma" | "video" | "embed" | "shader";

/** What each effect is and what it hands over in each of Grabient's forms: the one table a new effect fills in, which
    effect-conformance.test.ts holds every effect to, so an effect that hands over less says so here, and why in
    effect-why.ts (apart, so no page carries the words), rather than by a branch missing somewhere. Whether the view's
    angle turns it (the blob's palette always lies left to right), whether the view's soft blurs it (the blob's frost
    softens it already), and whether its picture is drawn by one drawing of its loop's time over a plain vector still (silk,
    rosette, papercut, strings, dimple, aurora: ui/effect-loop.ts plays them, and their still is an SVG with no filter
    but the aurora's one blur), where the glass and the blob have players and stills of their own. */
export interface EffectKindFacts {
  angle: boolean;
  /** the view's soft blurs it; the grain goes over every effect */
  soft: boolean;
  /** whether it takes a ground, `bg` in its address and its Appearance menu's Background field, and what none is
      (EffectGround); null for one that takes none, whose address leaves `bg` out */
  ground: EffectGround | null;
  /** the range of steps it takes, the Appearance menu's Steps field and `steps=` in its address, as a gradient's style
      takes them (the sandstone's: how many bands a sweep of the palette spans), its look's `steps`; null for one the
      steps leave alone, whose address leaves them out */
  steps: EffectSteps | null;
  /** the range of zoom it takes in its shape's place, the Appearance menu's Zoom field and `zoom=` in its address, its
      look's `zoom` (the dimple's: how large its discs and its hollow are drawn), which has one design and no shape
      (John, 10 Nov 2026, of its shapes: "theres barely any difference", then "lets repalce shape with a zoom option
      for this style"); null for one a number 0 to 999 picks the shape of (its look's `shape`, `shape=` in its address
      and the editor's Shape field), whose address leaves `zoom` out */
  zoom: EffectZoom | null;
  /** whether it takes a path in its shape's place, `path=` in its address, its look's `path` (the aurora's: the
      outline of its range, heights from the box's left edge to its right joined by lines or curves, as aurora-path.ts
      reads and writes it; John, 10 Nov 2026: "what if we made the path that cuts off the aura effect url encodable?",
      then "the idea was for LLMs to be able to create thieir custom path"); false for one a number 0 to 999 picks the
      shape of, whose address leaves `path` out */
  path: boolean;
  /** drawn by ui/effect-loop.ts over a vector still */
  vector: boolean;
  /** its still stands in for its first frame rather than being it (the papercut's shadows stepped, the aurora's light
      in broad wedges under a blur, for a list's cards and a page's first paint), so a page's stage shows the player's
      own first frame over it while the effect is held as well; the others' stills are that frame to within a level,
      which a held stage fades back to */
  steppedStill: boolean;
  /** how its SVG file moves at a speed: by CSS animations, by SMIL, or not at all, its still at any speed */
  svgMotion: "css" | "smil" | null;
  /** whether any frame of its loop is written as a plain SVG and CSS of its own (fx-still.ts fxFrameSvg), which the
      conformance suite draws and holds to its CPU frame at that time */
  frameSvg: boolean;
  /** what Copy for Figma pastes: layers that Figma's timeline plays; null where its layers could only stand still,
      since a paste that is its still is what its SVG already hands over, so no strip offers Copy for Figma (John,
      8 Nov 2026: "we can just drop it and they can use svg") */
  figma: "moving" | null;
  /** whether its clips are drawn (video-kinds.ts names them) */
  video: boolean;
  /** whether a script plays it behind another site's page (/{seed}.js, apps/web/src/embed) */
  embed: boolean;
  /** whether the Shader tab offers its code (apps/web features/editor/effect-sources.ts) */
  shader: boolean;
  /** what moves it: its own loop, which a clock plays, or the pointer alone, which its picture follows where a page
      can know it (the dimple's hollow: its stage, its script and its shader pages). One the pointer moves has no
      loop: nothing in it moves by itself, so its picture at any time is its first frame, its speed is how fast it
      follows (0 not at all), and it has no moving SVG and no clip (effect-why.ts). Its address's `roam` (EffectPlay)
      has it go round a loop of its own instead, the pointer left alone (John, 11 Nov 2026: "a toggle for making this
      style do a subtle animation as if the cursor was roaming around on the on canvas isntead of static + follows
      cursor"): the same first frame, its speed the loop's pace, and what its Copy for Figma pastes on Figma's
      timeline, which is offered only while it roams (hasFigma) */
  motion: "loop" | "pointer";
}
/** What every field effect is and hands over (kit/): drawn by one drawing of its loop's time over a vector still that
    is its first frame, turned by the angle and blurred by the soft; its levels change shape as it moves, so its SVG is
    its first frame and it has no Copy for Figma (effect-why.ts), and every other form plays it. Its steps are its file's
    (kit/types.ts FieldEffect.steps, as kit:gen writes them: kit/gen/kind-steps.ts). */
const KIT_FACTS: Omit<EffectKindFacts, "steps"> = {
  angle: true,
  soft: true,
  ground: null,
  zoom: null,
  path: false,
  vector: true,
  steppedStill: false,
  svgMotion: null,
  frameSvg: true,
  figma: null,
  video: true,
  embed: true,
  shader: true,
  motion: "loop"
};
export const EFFECT_KINDS: Readonly<Record<EffectKind, EffectKindFacts>> = {
  glass: {
    angle: true,
    soft: true,
    ground: null,
    steps: null,
    zoom: null,
    path: false,
    vector: false,
    steppedStill: false,
    svgMotion: "css",
    frameSvg: false,
    figma: "moving",
    video: true,
    embed: true,
    shader: true,
    motion: "loop"
  },
  blob: {
    angle: false,
    soft: false,
    ground: "clear",
    steps: null,
    zoom: null,
    path: false,
    vector: false,
    steppedStill: false,
    svgMotion: "css",
    frameSvg: false,
    figma: "moving",
    video: true,
    embed: true,
    shader: true,
    motion: "loop"
  },
  silk: {
    angle: true,
    soft: true,
    ground: null,
    steps: null,
    zoom: null,
    path: false,
    vector: true,
    steppedStill: false,
    svgMotion: "smil",
    frameSvg: true,
    figma: "moving",
    video: true,
    embed: true,
    shader: true,
    motion: "loop"
  },
  rosette: {
    angle: true,
    soft: true,
    ground: null,
    steps: null,
    zoom: null,
    path: false,
    vector: true,
    steppedStill: false,
    svgMotion: "css",
    frameSvg: true,
    figma: "moving",
    video: true,
    embed: true,
    shader: true,
    motion: "loop"
  },
  papercut: {
    angle: true,
    soft: true,
    ground: null,
    steps: null,
    zoom: null,
    path: false,
    vector: true,
    steppedStill: true,
    svgMotion: null,
    frameSvg: true,
    figma: null,
    video: true,
    embed: true,
    shader: true,
    motion: "loop"
  },
  strings: {
    angle: true,
    soft: true,
    ground: "designed",
    steps: null,
    zoom: null,
    path: false,
    vector: true,
    steppedStill: false,
    svgMotion: null,
    frameSvg: true,
    figma: null,
    video: true,
    embed: true,
    shader: true,
    motion: "loop"
  },
  dimple: {
    angle: true,
    soft: true,
    ground: null,
    steps: null,
    zoom: { least: 1, most: 4, designed: 1 },
    path: false,
    vector: true,
    steppedStill: false,
    svgMotion: null,
    frameSvg: true,
    figma: "moving",
    video: false,
    embed: true,
    shader: true,
    motion: "pointer"
  },
  aurora: {
    angle: true,
    soft: true,
    ground: "clear",
    steps: null,
    zoom: null,
    path: true,
    vector: true,
    steppedStill: true,
    svgMotion: null,
    frameSvg: true,
    figma: null,
    video: false,
    embed: false,
    shader: false,
    motion: "loop"
  },
  ...kitRecord(kind => ({ ...KIT_FACTS, steps: KIT_STEPS[kind] }))
};
/** Whether a number 0 to 999 picks an effect's shape: every effect's but one that takes a zoom in its shape's place
    (EFFECT_KINDS' `zoom`: the dimple, whose zoom runs from its design, which draws as many discs as its still may
    weigh, to four times as large) and one that takes a path there (EFFECT_KINDS' `path`: the aurora, whose range is
    any outline its address writes). */
export const takesShape = (kind: EffectKind): boolean =>
  !EFFECT_KINDS[kind].zoom && !EFFECT_KINDS[kind].path;
/** Whether an effect has a script that plays it behind another site's page (/{seed}.js, apps/web/src/embed); one
    without offers its stylesheet alone, which paints its still, in its strips, its tags and its Markdown. */
export const hasEmbedScript = (kind: EffectKind): boolean => EFFECT_KINDS[kind].embed;
/** The effects drawn by one drawing of their loop's time over a vector still. */
export type VectorKind =
  | "silk"
  | "rosette"
  | "papercut"
  | "strings"
  | "dimple"
  | "aurora"
  | KitKind;
export const isVectorKind = (kind: EffectKind | null | undefined): kind is VectorKind =>
  !!kind && EFFECT_KINDS[kind].vector;
/** The effects Copy for Figma pastes, as layers that Figma's timeline plays (EFFECT_KINDS' figma); the others' strips
    offer their SVG in its place. */
export type FigmaKind = "glass" | "blob" | "silk" | "rosette" | "dimple";
export const hasFigma = (kind: EffectKind): kind is FigmaKind => EFFECT_KINDS[kind].figma !== null;
/** Whether an effect's `roam` means anything: one the pointer moves (EFFECT_KINDS' motion: the dimple). */
export const canRoam = (kind: EffectKind): boolean => EFFECT_KINDS[kind].motion === "pointer";
/** Whether an effect as it plays goes round a loop of its own: every effect but one the pointer moves, which does
    only while it roams. What Figma's timeline, a clock and a card under the pointer play. */
export const loops = (effect: Pick<Effect, "kind" | "roam">): boolean =>
  EFFECT_KINDS[effect.kind].motion === "loop" || effect.roam === true;
/** Whether Copy for Figma is offered for an effect as it plays: where Figma's timeline plays it (hasFigma), and for
    one the pointer moves only while it roams, since a pointer's following is nothing a timeline holds. */
export const pastesToFigma = (effect: Pick<Effect, "kind" | "roam">): boolean =>
  hasFigma(effect.kind) && loops(effect);

/** Speeds: 0 holds the first frame (the animation off), then from `slowest` to `max`. */
export const EFFECT_SPEED = { min: 0, slowest: 0.1, max: 10 } as const;
/** Frames a second: `default` unless an address says, up to `max` where the screen shows that many. */
export const EFFECT_FPS = { min: 1, default: 60, max: 120 } as const;

/** How an effect plays: the same settings for each. */
export interface EffectPlay {
  /** the loop's pace, its designed length over this; 0 holds the first frame, the animation off */
  speed: number;
  /** frames a second at most: a screen slower than this shows its own */
  fps: number;
  /** an effect the pointer moves (EFFECT_KINDS' motion) going round a loop of its own instead, `roam=1` in its
      address: true while it roams, left out otherwise and by every effect with a loop */
  roam?: boolean;
}
export const EFFECT_PLAY: EffectPlay = { speed: 1, fps: EFFECT_FPS.default };
/** Seconds a player's motion takes from rest to its pace, as it starts and as it resumes, so a still picture comes
    alive rather than jumps; the effects' shader pages ease in the same. */
export const EFFECT_EASE_S = 1.6;
/** The device pixels a player draws a frame at most (a 4K screen's): the canvas at the screen's density up to this. */
export const EFFECT_PIXELS_MAX = 8_300_000;
/** Milliseconds a canvas's new size settles before a player lays its drawing out again. */
export const EFFECT_SETTLE_MS = 150;

/** An effect's look: its shape, the blob's frost, the ground of an effect that takes one, the steps of one that takes
    them, the zoom of one that takes one and the path of one that takes one, each left as it is by an effect that
    takes none. */
export interface EffectLook {
  /** a number from 0 to SHAPE_MAX that picks the shape: the blobs' forms, where they stand and how they wander, or
      the glass's ribs and the colors drifting behind them; null for the blob the palette's own numbers draw, and the
      glass as designed, which shape 0 is too, and for an effect that takes no shape (takesShape) */
  shape: number | null;
  /** the blob's frost: 1 as designed, 0 none, BLOB_FROST_MAX twice */
  frost: number;
  /** the ground of an effect that takes one (EFFECT_KINDS' `ground`): #rrggbb, or #rrggbbaa where it lets what is
      behind it through, the strings' wholly clear one CLEAR_GROUND; null for none, the blob's clear and the strings'
      as designed */
  bg: string | null;
  /** an effect's steps where it takes them (EFFECT_KINDS' `steps`), within their range: null as designed, and for every
      effect that takes none */
  steps: number | null;
  /** an effect's zoom where it takes one (EFFECT_KINDS' `zoom`), within its range: null as designed, and for every
      effect that takes none */
  zoom: number | null;
  /** an effect's path where it takes one (EFFECT_KINDS' `path`), in its one spelling (aurora-path.ts): null as
      designed, and for every effect that takes none */
  path: string | null;
}
export const EFFECT_LOOK: EffectLook = {
  shape: null,
  frost: 1,
  bg: null,
  steps: null,
  zoom: null,
  path: null
};
export const BLOB_FROST_MAX = 2;
/** The last shape number, the same for both effects: an address writes a shape in one to three digits. */
export const SHAPE_MAX = 999;

/** A wholly clear ground, as an effect whose none is its designed ground keeps one (the strings'): every clear color
    is the one picture, the page through it. */
export const CLEAR_GROUND = "#00000000";

/** A ground as an address writes it: 3, 4, 6 or 8 hex digits, with or without `#`, as `#rrggbb`, or `#rrggbbaa` while
    it lets something through; null for none and for anything else, which the Worker has written as hex before a page
    or a file reads it (css-color.ts); one wholly clear null too, or CLEAR_GROUND where `clear` keeps it. */
export function groundHex(raw: string | null | undefined, clear = false): string | null {
  const digits = raw
    ? /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw.trim())?.[1]?.toLowerCase()
    : undefined;
  if (!digits) return null;
  const full = digits.length < 6 ? digits.replace(/./g, c => c + c) : digits;
  const alpha = full.slice(6);
  if (alpha === "00") return clear ? CLEAR_GROUND : null;
  return `#${alpha === "ff" ? full.slice(0, 6) : full}`;
}

/** The ground an effect's look keeps of one written (groundHex), as EFFECT_KINDS' `ground` says: a wholly clear one
    kept where none is the designed ground (the strings'), and none where none is clear (the blob's) or for an effect
    that takes no ground. */
export const effectGround = (kind: EffectKind, raw: unknown): string | null => {
  const ground = EFFECT_KINDS[kind].ground;
  return ground && typeof raw === "string" ? groundHex(raw, ground === "designed") : null;
};

/** Whether an effect's picture lets what is behind it through: a ground under a whole alpha, or none where none is
    clear (the blob's). Such a picture stands on the page with no gradient under its soft edges (fx-finish.ts
    effectUnderlay), and on a picture that cannot be clear, over the ground that picture takes (a clip, a share card). */
export const effectBare = (kind: EffectKind, look: Pick<EffectLook, "bg">): boolean => {
  const ground = EFFECT_KINDS[kind].ground;
  return !!ground && (look.bg ? groundParts(look.bg).alpha < 1 : ground === "clear");
};

/** A ground's color and its alpha, 0 to 1: what a picture paints under the effect. */
export function groundParts(bg: string): { hex: string; alpha: number } {
  return {
    hex: bg.slice(0, 7),
    alpha: bg.length === 9 ? parseInt(bg.slice(7), 16) / 255 : 1
  };
}

/** The name a blob's still goes by on a page (server/blob-still.ts, BlobLayer.tsx): its palette's seed and its look,
    which are all its first frame depends on. */
export const blobStillKey = (seed: string, look: EffectLook): string =>
  [seed, look.frost, look.shape ?? "", look.bg ?? ""].join("|");

/** A still's name read back, or null for one no page wrote. */
export function readBlobStillKey(key: string): { seed: string; look: EffectLook } | null {
  const parts = key.split("|");
  if (parts.length !== 4) return null;
  const [seed, frost, shape, bg] = parts;
  if (!/^[\w-]{2,}$/.test(seed)) return null;
  const look = effectLook({
    frost: Number(frost),
    shape: shape === "" ? null : Number(shape),
    bg: bg === "" ? null : bg
  });
  return blobStillKey(seed, look) === key ? { seed, look } : null;
}

/** What a vector effect's first frame depends on besides its palette: its turn, its shape, its steps, its zoom, its
    path and its ground. */
export interface FxLook {
  angle: number;
  /** 0 or none: as designed */
  shape: number | null;
  /** its look's steps where it takes them (EffectLook): null as designed, and for every effect that takes none */
  steps: number | null;
  /** its look's zoom where it takes one (EffectLook): null as designed, and for every effect that takes none */
  zoom: number | null;
  /** its look's path where it takes one (EffectLook): null as designed, and for every effect that takes none */
  path: string | null;
  /** its look's ground where it takes one (EffectLook): null as designed, and for every effect that takes none */
  bg: string | null;
}

/** A vector effect's FxLook: the view's angle and its look's shape, steps, zoom, path and ground. */
export const fxLookOf = (
  look: Pick<EffectLook, "shape" | "steps" | "zoom" | "path" | "bg">,
  angle: number
): FxLook => ({
  angle,
  shape: look.shape,
  steps: look.steps,
  zoom: look.zoom,
  path: look.path,
  bg: look.bg
});

/** The name a still goes by on a page: its kind, its palette's seed, its angle and its shape, its steps where its look
    names them (an effect that takes steps, at any but its designed number), its zoom where it names one, its `x`
    telling it from steps, its path where it names one, the word it starts with telling it from both, and its ground
    where it names one, its `#` telling it from them all. */
export const fxStillKey = (kind: VectorKind, seed: string, look: FxLook): string =>
  [
    kind,
    seed,
    look.angle,
    look.shape ?? "",
    ...(look.steps === null ? [] : [look.steps]),
    ...(look.zoom === null ? [] : [`${look.zoom}x`]),
    ...(look.path === null ? [] : [look.path]),
    ...(look.bg === null ? [] : [look.bg])
  ].join("|");

/** The shape number a palette suggests for its blob: the same for the same palette, so a blob whose address names no
    shape is drawn alike by the server, the editor and every reload. */
export const blobShapeOf = (seed: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return (h >>> 0) % (SHAPE_MAX + 1);
};

/** An effect's settings: how it plays, and its look. */
export interface EffectSettings extends EffectPlay {
  look: EffectLook;
}

/** An effect as an address carries it. */
export interface Effect extends EffectSettings {
  kind: EffectKind;
}

/** An effect's steps as its look keeps them: a whole number within the range it takes (EFFECT_KINDS' `steps`), none
    at its designed number, and none for anything that is no number or an effect that takes no steps. */
export const effectSteps = (kind: EffectKind, value: unknown): number | null =>
  inRange(EFFECT_KINDS[kind].steps, value, 1);
/** An effect's zoom as its look keeps it: two decimals within the range it takes (EFFECT_KINDS' `zoom`), none at its
    designed zoom, and none for anything that is no number or an effect that takes no zoom. */
export const effectZoom = (kind: EffectKind, value: unknown): number | null =>
  inRange(EFFECT_KINDS[kind].zoom, value, 100);
/** An effect's path as its look keeps it: in its one spelling where the effect takes one (EFFECT_KINDS' `path`), none
    for its designed path, and none for anything that is no path or an effect that takes none. */
export const effectPath = (kind: EffectKind, value: unknown): string | null =>
  EFFECT_KINDS[kind].path ? auroraPath(value) : null;
/* a number kept to `grain` a unit within a range, none at its designed value, and none for anything that is no number
   or a range that is none */
function inRange(range: EffectZoom | null, value: unknown, grain: number): number | null {
  const n = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!range || value === "" || value === null || !Number.isFinite(n)) return null;
  const kept = clamp(Math.round(n * grain) / grain, range.least, range.most);
  return kept === range.designed ? null : kept;
}
/** A look as stored or asked for: each part in its bounds, its steps, its zoom, its path and its ground those `kind`
    takes (effectSteps, effectZoom, effectPath, effectGround) and its shape where it takes one; where no kind is said,
    no steps, no zoom and no path, and a ground as the blob's, none where clear. */
export function effectLook(
  v: Partial<EffectLook> | null | undefined,
  kind?: EffectKind
): EffectLook {
  const frost = Number(v?.frost);
  const shape = Number(v?.shape);
  return {
    shape:
      (kind && !takesShape(kind)) ||
      v?.shape === null ||
      v?.shape === undefined ||
      !Number.isFinite(shape)
        ? null
        : clamp(Math.round(shape), 0, SHAPE_MAX),
    frost: Number.isFinite(frost) ? clamp(Math.round(frost * 100) / 100, 0, BLOB_FROST_MAX) : 1,
    bg: kind ? effectGround(kind, v?.bg) : typeof v?.bg === "string" ? groundHex(v.bg) : null,
    steps: kind ? effectSteps(kind, v?.steps) : null,
    zoom: kind ? effectZoom(kind, v?.zoom) : null,
    path: kind ? effectPath(kind, v?.path) : null
  };
}

/** A speed as the address keeps it: 0, or two decimals from `slowest` to `max`; 1 for anything no number. */
export const effectSpeed = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 1;
  const kept = Math.round(n * 100) / 100;
  return kept === 0 ? 0 : clamp(kept, EFFECT_SPEED.slowest, EFFECT_SPEED.max);
};
/** Frames a second as the address keeps them: a whole number from 1 to 120; 60 for anything no number. */
export const effectFps = (value: unknown): number => {
  const n = Math.round(Number(value));
  return value !== null && value !== undefined && value !== "" && Number.isFinite(n) && n >= 1
    ? Math.min(n, EFFECT_FPS.max)
    : EFFECT_FPS.default;
};

/** An effect as a palette's title says it after the palette's name, in a gradient's style's place, since it draws no
    gradient: "Pastel pink and blue rosette". English as written; a page says it in its reader's language. */
export const EFFECT_WORDS: Readonly<Record<EffectKind, string>> = {
  glass: msg("fluted glass"),
  blob: msg("blob"),
  silk: msg("silk"),
  rosette: msg("rosette"),
  papercut: msg("papercut"),
  strings: msg("strings"),
  dimple: msg("dimple"),
  aurora: msg("aurora"),
  ...KIT_WORDS
};
/** The style and steps a palette's colors are read and named in while it plays an effect: an effect's address names
    neither, since it draws no gradient, so they are the ones an address that names none gives, whatever gradient the
    editor keeps under the effect to give back. Its page, its editor, its cards and its files then call it alike. */
export const effectView = (P: Palette): Pick<View, "style" | "steps"> => {
  const { style, steps } = drawnView(P);
  return { style, steps };
};

/** The effect an address asks for, or null where its style is a gradient's or none. The glass reads its shape alone
    of the look, its shape 0 the glass as designed, as none is. A shape of one to three digits is read; a longer number
    is no shape, as any word that is no number is, rather than another shape under a second address. An effect that
    takes no shape reads none (takesShape). An effect that takes steps reads `steps` of one to three digits too,
    clamped to its range, none at its designed number; one that takes a zoom reads `zoom`, a number kept to two
    decimals within its range, none at its designed zoom; one that takes a path reads `path`, kept in its one spelling,
    none at its designed path and for anything that is no path (effectPath); and one that takes a ground its `bg`
    (effectGround). */
export function parseEffect(params: ParamReader): Effect | null {
  const kind = params.get("style");
  if (!isEffect(kind)) return null;
  const speed = params.get("speed");
  const shape = params.get("shape");
  const frost = params.get("frost");
  const steps = params.get("steps");
  const shaped =
    takesShape(kind) && shape !== null && /^\d{1,3}$/.test(shape) ? Number(shape) : null;
  return {
    kind,
    speed: speed === null ? 1 : effectSpeed(speed),
    fps: effectFps(params.get("fps")),
    ...(canRoam(kind) && params.get("roam") === "1" ? { roam: true } : {}),
    look:
      kind === "blob"
        ? effectLook({
            frost: frost !== null && /^\d+(\.\d+)?$/.test(frost) ? Number(frost) : 1,
            shape: shaped,
            bg: params.get("bg")
          })
        : {
            ...EFFECT_LOOK,
            shape: shaped || null,
            bg: effectGround(kind, params.get("bg")),
            steps: steps !== null && /^\d{1,3}$/.test(steps) ? effectSteps(kind, steps) : null,
            zoom: effectZoom(kind, params.get("zoom")),
            path: effectPath(kind, params.get("path"))
          }
  };
}

const written = (parts: (string | false | null)[]): string[] =>
  parts.filter((part): part is string => Boolean(part));

/** An effect's look as an address writes it, defaults left out: all its first frame depends on but its palette and
    the glass's angle. The glass's is its shape alone, the sandstone's its steps and its shape, the strings' their
    shape and their ground, the dimple's its zoom, the aurora's its path and its range's ground; a path is written
    with its commas and colons as they are, as the locks' words are, and a ground with its `#` (escaped), so no color
    reads as a number. */
export const effectLookParts = (effect: Effect): string[] => {
  const look = effect.look;
  const kind = EFFECT_KINDS[effect.kind];
  const bg = look.bg && kind.ground && `bg=${look.bg.replace("#", "%23")}`;
  return written(
    effect.kind === "blob"
      ? [
          look.frost !== 1 && `frost=${look.frost}`,
          look.shape !== null && `shape=${look.shape}`,
          bg
        ]
      : [
          look.steps !== null && kind.steps !== null && `steps=${look.steps}`,
          look.zoom !== null && kind.zoom !== null && `zoom=${look.zoom}`,
          look.shape && takesShape(effect.kind) ? `shape=${look.shape}` : null,
          look.path !== null && kind.path && `path=${look.path}`,
          bg
        ]
  );
};

/** The effect's parts of an address after its style and angle, defaults left out, in one order: how it plays, then
    its look. */
export const effectParts = (effect: Effect): string[] => [
  ...written([
    effect.speed !== 1 && `speed=${effect.speed}`,
    effect.fps !== EFFECT_FPS.default && `fps=${effect.fps}`,
    effect.roam === true && canRoam(effect.kind) && "roam=1"
  ]),
  ...effectLookParts(effect)
];

/** The angle part of an effect's address, where it is not the view's default: the blob has none. */
export const effectAngleParts = (kind: EffectKind, angle: number): string[] =>
  EFFECT_KINDS[kind].angle && angle !== DEFAULT_ANGLE ? [`angle=${angle}`] : [];

/** The soft and the grain an effect takes of a view's, each where it has one: the blob takes the grain alone, so its
    picture, its address and its files are the same whatever soft an address or a save says. */
export const effectFinish = (
  kind: EffectKind,
  finish: { soft?: number | null; grain?: number | null } | null | undefined
): EffectFinish => finishOf(EFFECT_KINDS[kind].soft ? finish : { grain: finish?.grain });

/** The parts of an effect's address its first frame depends on, which name a still or a card of it: its style, the
    glass's angle where it is not the view's default, the soft and the grain it takes, and its look, never how it
    plays. */
export const effectStillParts = (
  effect: Effect,
  angle: number,
  finish: EffectFinish = {}
): string[] => [
  `style=${effect.kind}`,
  ...effectAngleParts(effect.kind, angle),
  ...finishParts(effectFinish(effect.kind, finish)),
  ...effectLookParts(effect)
];

/** An effect's address after its palette's seed, which its page and its files are named by: its style, the angle where
    the effect takes one and it is not the view's default, the soft and the grain it takes, how it plays and its look. */
export const effectAddressParts = (
  effect: Effect,
  angle: number,
  finish: EffectFinish = {}
): string[] => [
  `style=${effect.kind}`,
  ...effectAngleParts(effect.kind, angle),
  ...finishParts(effectFinish(effect.kind, finish)),
  ...effectParts(effect)
];

/** The address of one of an effect's files: the stylesheet that paints its first frame behind a page, the script that
    plays it from there, its moving SVG, its first frame as PNG, or its clip as MP4, these three at a size where one is
    asked, or the palette's Markdown or JSON, which name the effect. */
export function effectFileAddress(
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  extension: "css" | "js" | "svg" | "png" | "md" | "json" | "mp4",
  size?: Size,
  finish: EffectFinish = {}
): string {
  const sized =
    size && (extension === "svg" || extension === "png" || extension === "mp4")
      ? [`w=${size.width}`, `h=${size.height}`]
      : [];
  return `${origin}/${seed}.${extension}?${[...effectAddressParts(effect, angle, finish), ...sized].join("&")}`;
}

/** The mark the embed's script sets on a page's root once its canvas covers the still (apps/web/src/embed/mount.ts),
    which takes the still away, and the gradient and the grain the page lays with it, which the canvas's layer lays
    itself: the blob's canvas is clear around the blobs and draws their ground itself, and the others', opaque once
    faded in, hide it, so a resize never draws the still's filter again under it. */
export const EMBED_PLAYING = "data-grabient-playing";

/** Whether two settings are the same. */
export const sameSettings = (a: EffectSettings, b: EffectSettings): boolean =>
  a.speed === b.speed &&
  a.fps === b.fps &&
  !a.roam === !b.roam &&
  a.look.frost === b.look.frost &&
  a.look.shape === b.look.shape &&
  a.look.bg === b.look.bg &&
  a.look.steps === b.look.steps &&
  a.look.zoom === b.look.zoom &&
  a.look.path === b.look.path;
