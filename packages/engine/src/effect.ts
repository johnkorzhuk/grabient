/* The effects a palette's picture can play instead of a gradient: the fluted glass (glass.ts) and the blob (blob.ts).
   An effect rides the palette's address as `style=glass` or `style=blob`, then for the glass the view's `angle`, which
   turns its ribs (the blob has none: its palette lies from left to right), then how it plays: `speed` (the loop's pace, 1 as designed, 0 its
   first frame held with no motion) and `fps` (frames a second at most: 60 unless it says, up to 120 where a screen
   shows that many), then its look: `shape`, a number from 0 to 999 that picks the blobs' forms and wanderings or the
   glass's ribs and the colors drifting behind them, and the blob's `frost` and `bg`, its ground: any CSS color, which
   an address keeps as hex (the Worker writes any other spelling as hex, css-color.ts), none leaving it clear.
   The gradient's steps leave the address while an effect plays, so an address says only what its picture shows (the
   editor keeps them to give back). */
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

export const EFFECTS = ["glass", "blob", "silk", "rosette", "papercut"] as const;
export type EffectKind = (typeof EFFECTS)[number];
export const isEffect = (value: unknown): value is EffectKind =>
  typeof value === "string" && (EFFECTS as readonly string[]).includes(value);

/** What each effect is, for the code that treats them alike: whether the view's angle turns it (the blob's palette
    always lies left to right), whether the view's soft blurs it (the blob's frost softens it already), and whether its
    picture is drawn by one drawing of its loop's time over a plain vector still (silk, rosette, papercut:
    ui/effect-loop.ts plays them, and their still is an SVG with no filter), where the glass and the blob have players
    and stills of their own. */
export interface EffectKindFacts {
  angle: boolean;
  /** the view's soft blurs it; the grain goes over every effect */
  soft: boolean;
  /** drawn by ui/effect-loop.ts over a vector still */
  vector: boolean;
  /** its still stands in for its first frame rather than being it (the papercut's shadows stepped, for a list's cards
      and a page's first paint), so a page's stage shows the player's own first frame over it while the effect is
      held as well; the others' stills are that frame to within a level, which a held stage fades back to */
  steppedStill: boolean;
}
export const EFFECT_KINDS: Readonly<Record<EffectKind, EffectKindFacts>> = {
  glass: { angle: true, soft: true, vector: false, steppedStill: false },
  blob: { angle: false, soft: false, vector: false, steppedStill: false },
  silk: { angle: true, soft: true, vector: true, steppedStill: false },
  rosette: { angle: true, soft: true, vector: true, steppedStill: false },
  papercut: { angle: true, soft: true, vector: true, steppedStill: true }
};
/* the effects a script plays behind another site's page: every one since the papercut's, the list staying the one
   switch for an effect that lands before its script, as the silk, the rosette and the papercut did */
const SCRIPTED: readonly EffectKind[] = ["glass", "blob", "silk", "rosette", "papercut"];
/** Whether an effect has a script that plays it behind another site's page (/{seed}.js, apps/web/src/embed); one
    without offers its stylesheet alone, which paints its still, in its strips, its tags and its Markdown. */
export const hasEmbedScript = (kind: EffectKind): boolean => SCRIPTED.includes(kind);
/** The effects drawn by one drawing of their loop's time over a vector still. */
export type VectorKind = "silk" | "rosette" | "papercut";
export const isVectorKind = (kind: EffectKind | null | undefined): kind is VectorKind =>
  !!kind && EFFECT_KINDS[kind].vector;

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
}
export const EFFECT_PLAY: EffectPlay = { speed: 1, fps: EFFECT_FPS.default };
/** Seconds a player's motion takes from rest to its pace, as it starts and as it resumes, so a still picture comes
    alive rather than jumps; the effects' shader pages ease in the same. */
export const EFFECT_EASE_S = 1.6;
/** The device pixels a player draws a frame at most (a 4K screen's): the canvas at the screen's density up to this. */
export const EFFECT_PIXELS_MAX = 8_300_000;
/** Milliseconds a canvas's new size settles before a player lays its drawing out again. */
export const EFFECT_SETTLE_MS = 150;

/** An effect's look: its shape, and the blob's frost and ground, which the glass leaves as they are. */
export interface EffectLook {
  /** a number from 0 to SHAPE_MAX that picks the shape: the blobs' forms, where they stand and how they wander, or
      the glass's ribs and the colors drifting behind them; null for the blob the palette's own numbers draw, and the
      glass as designed, which shape 0 is too */
  shape: number | null;
  /** the blob's frost: 1 as designed, 0 none, BLOB_FROST_MAX twice */
  frost: number;
  /** the blob's ground: #rrggbb, or #rrggbbaa where it lets what is behind it through; null for none, clear */
  bg: string | null;
}
export const EFFECT_LOOK: EffectLook = { shape: null, frost: 1, bg: null };
export const BLOB_FROST_MAX = 2;
/** The last shape number, the same for both effects: an address writes a shape in one to three digits. */
export const SHAPE_MAX = 999;

/** A ground as an address writes it: 3, 4, 6 or 8 hex digits, with or without `#`, as `#rrggbb`, or `#rrggbbaa` while
    it lets something through; null for none, for one wholly clear and for anything else, which the Worker has
    written as hex before a page or a file reads it (css-color.ts). */
export function groundHex(raw: string | null | undefined): string | null {
  const digits = raw
    ? /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(raw.trim())?.[1]?.toLowerCase()
    : undefined;
  if (!digits) return null;
  const full = digits.length < 6 ? digits.replace(/./g, c => c + c) : digits;
  const alpha = full.slice(6);
  if (alpha === "00") return null;
  return `#${alpha === "ff" ? full.slice(0, 6) : full}`;
}

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

/** What a vector effect's first frame depends on besides its palette: its turn and its shape. */
export interface FxLook {
  angle: number;
  /** 0 or none: as designed */
  shape: number | null;
}

/** The name a still goes by on a page: its kind, its palette's seed, its angle and its shape. */
export const fxStillKey = (kind: VectorKind, seed: string, look: FxLook): string =>
  [kind, seed, look.angle, look.shape ?? ""].join("|");

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

/** A look as stored or asked for: each part in its bounds. */
export function effectLook(v: Partial<EffectLook> | null | undefined): EffectLook {
  const frost = Number(v?.frost);
  const shape = Number(v?.shape);
  return {
    shape:
      v?.shape === null || v?.shape === undefined || !Number.isFinite(shape)
        ? null
        : clamp(Math.round(shape), 0, SHAPE_MAX),
    frost: Number.isFinite(frost) ? clamp(Math.round(frost * 100) / 100, 0, BLOB_FROST_MAX) : 1,
    bg: typeof v?.bg === "string" ? groundHex(v.bg) : null
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
  papercut: msg("papercut")
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
    is no shape, as any word that is no number is, rather than another shape under a second address. */
export function parseEffect(params: ParamReader): Effect | null {
  const kind = params.get("style");
  if (!isEffect(kind)) return null;
  const speed = params.get("speed");
  const shape = params.get("shape");
  const frost = params.get("frost");
  const shaped = shape !== null && /^\d{1,3}$/.test(shape) ? Number(shape) : null;
  return {
    kind,
    speed: speed === null ? 1 : effectSpeed(speed),
    fps: effectFps(params.get("fps")),
    look:
      kind === "blob"
        ? effectLook({
            frost: frost !== null && /^\d+(\.\d+)?$/.test(frost) ? Number(frost) : 1,
            shape: shaped,
            bg: params.get("bg")
          })
        : { ...EFFECT_LOOK, shape: shaped || null }
  };
}

const written = (parts: (string | false | null)[]): string[] =>
  parts.filter((part): part is string => Boolean(part));

/** An effect's look as an address writes it, defaults left out: all its first frame depends on but its palette and
    the glass's angle. The glass's is its shape alone; a ground is written with its `#` (escaped), so no color reads as a
    number. */
export const effectLookParts = (effect: Effect): string[] => {
  const look = effect.look;
  return effect.kind === "blob"
    ? written([
        look.frost !== 1 && `frost=${look.frost}`,
        look.shape !== null && `shape=${look.shape}`,
        look.bg && `bg=${look.bg.replace("#", "%23")}`
      ])
    : written([look.shape ? `shape=${look.shape}` : null]);
};

/** The effect's parts of an address after its style and angle, defaults left out, in one order: how it plays, then
    its look. */
export const effectParts = (effect: Effect): string[] => [
  ...written([
    effect.speed !== 1 && `speed=${effect.speed}`,
    effect.fps !== EFFECT_FPS.default && `fps=${effect.fps}`
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
  a.look.frost === b.look.frost &&
  a.look.shape === b.look.shape &&
  a.look.bg === b.look.bg;
