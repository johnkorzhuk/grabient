/* The effects a palette's picture can play instead of a gradient: the fluted glass (glass.ts) and the blob (blob.ts).
   An effect rides the palette's address as `style=glass` or `style=blob`, then the view's `angle`, which turns the
   glass's ribs and lays the palette across the blobs, then how it plays: `speed` (the loop's pace, 1 as designed, 0 its
   first frame held with no motion) and `fps` (frames a second at most: 60 unless it says, up to 120 where a screen
   shows that many), then its look: `shape`, a number that picks the blobs' forms and wanderings or the glass's ribs and
   the colors drifting behind them, and the blob's `frost` and `bg`, its ground: any CSS color, which an address keeps
   as hex (the Worker writes any other spelling as hex, css-color.ts), none leaving it clear.
   The gradient's steps leave the address while an effect plays, so an address says only what its picture shows (the
   editor keeps them to give back). */
import { clamp } from "./math.ts";
import { DEFAULT_ANGLE, type ParamReader, type Size } from "./view.ts";

export const EFFECTS = ["glass", "blob"] as const;
export type EffectKind = (typeof EFFECTS)[number];
export const isEffect = (value: unknown): value is EffectKind =>
  typeof value === "string" && (EFFECTS as readonly string[]).includes(value);

/** Speeds: 0 holds the first frame (the animation off), then from `slowest` to `max`. */
export const EFFECT_SPEED = { min: 0, slowest: 0.1, max: 10 } as const;
/** Frames a second: `default` unless an address says, up to `max` where the screen shows that many. */
export const EFFECT_FPS = { min: 1, default: 60, max: 120 } as const;
export const EFFECT_FPS_MAX = EFFECT_FPS.max;

/** How an effect plays: the same settings for each. */
export interface EffectPlay {
  /** the loop's pace, its designed length over this; 0 holds the first frame, the animation off */
  speed: number;
  /** frames a second at most: a screen slower than this shows its own */
  fps: number;
}
export const EFFECT_PLAY: EffectPlay = { speed: 1, fps: EFFECT_FPS.default };

/** Whether an effect holds its first frame: no motion, nothing to play. */
export const isStill = (play: EffectPlay): boolean => play.speed === 0;

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
export const SHAPE_MAX = 9999;

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

/** The name a blob's still goes by on a page (server/blob-still.ts, BlobLayer.tsx): its palette's seed, its look and
    the angle the palette lies across it at, which are all its first frame depends on. */
export const blobStillKey = (seed: string, look: EffectLook, angle: number): string =>
  [seed, look.frost, look.shape ?? "", look.bg ?? "", angle].join("|");

/** A still's name read back, or null for one no page wrote. */
export function readBlobStillKey(
  key: string
): { seed: string; look: EffectLook; angle: number } | null {
  const parts = key.split("|");
  if (parts.length !== 5) return null;
  const [seed, frost, shape, bg, angle] = parts;
  if (!/^[\w-]{2,}$/.test(seed) || !/^\d{1,3}$/.test(angle) || Number(angle) > 360) return null;
  const look = effectLook({
    frost: Number(frost),
    shape: shape === "" ? null : Number(shape),
    bg: bg === "" ? null : bg
  });
  return blobStillKey(seed, look, Number(angle)) === key
    ? { seed, look, angle: Number(angle) }
    : null;
}

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

/** The effect an address asks for, or null where its style is a gradient's or none. The glass reads its shape alone
    of the look, its shape 0 the glass as designed, as none is. */
export function parseEffect(params: ParamReader): Effect | null {
  const kind = params.get("style");
  if (!isEffect(kind)) return null;
  const speed = params.get("speed");
  const shape = params.get("shape");
  const frost = params.get("frost");
  const shaped = shape !== null && /^\d{1,4}$/.test(shape) ? Number(shape) : null;
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
    its angle. The glass's is its shape alone; a ground is written with its `#` (escaped), so no color reads as a
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

/** An effect's address after its palette's seed, which its page and its files are named by: its style, its angle where
    it is not the view's default, how it plays and its look. */
export const effectAddressParts = (effect: Effect, angle: number): string[] => [
  `style=${effect.kind}`,
  ...(angle !== DEFAULT_ANGLE ? [`angle=${angle}`] : []),
  ...effectParts(effect)
];

/** The address of one of an effect's files: the stylesheet that paints its first frame behind a page, the script that
    plays it from there, its moving SVG, or its first frame as PNG, these two at a size where one is asked. */
export function effectFileAddress(
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  extension: "css" | "js" | "svg" | "png",
  size?: Size
): string {
  const sized =
    size && (extension === "svg" || extension === "png")
      ? [`w=${size.width}`, `h=${size.height}`]
      : [];
  return `${origin}/${seed}.${extension}?${[...effectAddressParts(effect, angle), ...sized].join("&")}`;
}

/** The mark the embed's script sets on a page's root once its canvas shows (apps/web/src/embed/mount.ts), which takes
    the blob's still away: the blob's canvas is clear around the blobs, and draws their ground itself. */
export const EMBED_PLAYING = "data-grabient-playing";

/** The rules that paint an effect's first frame behind a page: a layer fixed behind it, under its content and over its
    ground, showing the still (a CSS background), which the blob's gives up once the script's canvas shows. */
export function effectLayerCss(kind: EffectKind, still: string): string {
  const layer = `html::before {\n  content: "";\n  position: fixed;\n  inset: 0;\n  z-index: -1;\n  pointer-events: none;\n  background: ${still};\n}\n`;
  return kind === "blob"
    ? `${layer}html[${EMBED_PLAYING}]::before {\n  background: none;\n}\n`
    : layer;
}

/** The tags that play an effect behind a page, for its head: its first frame, then the script that plays it from
    there. With the still, the first frame is in the page itself, a style, so the page waits on no other site to paint;
    without, the stylesheet of the same address paints it. */
export function effectEmbedHtml(
  origin: string,
  seed: string,
  effect: Effect,
  angle: number,
  still?: string
): string {
  const at = (extension: "css" | "js") =>
    effectFileAddress(origin, seed, effect, angle, extension).replaceAll("&", "&amp;");
  const first = still
    ? `<style>\n${effectLayerCss(effect.kind, still)}</style>`
    : `<link rel="stylesheet" href="${at("css")}">`;
  return `${first}\n<script src="${at("js")}" async></script>`;
}

/** Whether two settings are the same. */
export const sameSettings = (a: EffectSettings, b: EffectSettings): boolean =>
  a.speed === b.speed &&
  a.fps === b.fps &&
  a.look.frost === b.look.frost &&
  a.look.shape === b.look.shape &&
  a.look.bg === b.look.bg;
