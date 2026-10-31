/* The effects a palette's picture can play instead of a gradient: the fluted glass (glass.ts) and the blob. An effect
   rides the palette's address as `style=glass` or `style=blob`, then how it plays: `speed` (the loop's pace, 1 as
   designed, 0 its first frame held with no motion) and `fps` (frames a second at most; none, the screen's own), and
   the blob's own look (`depth=0`, `fill=1`, `frost`, `shape`, `bg`).
   The gradient's steps leave the address while an effect plays, so an address says only what its picture shows (the
   editor keeps them to give back); the angle is the view's, and turns the glass's ribs. */
import { clamp } from "./math.ts";
import type { ParamReader } from "./view.ts";

export const EFFECTS = ["glass", "blob"] as const;
export type EffectKind = (typeof EFFECTS)[number];
export const isEffect = (value: unknown): value is EffectKind =>
  typeof value === "string" && (EFFECTS as readonly string[]).includes(value);

/** Speeds: 0 holds the first frame (the animation off), then from `slowest` to `max`. */
export const EFFECT_SPEED = { min: 0, slowest: 0.1, max: 10 } as const;
export const EFFECT_FPS_MAX = 60;

/** How an effect plays: the same settings for each. */
export interface EffectPlay {
  /** the loop's pace, its designed length over this; 0 holds the first frame, the animation off */
  speed: number;
  /** frames a second at most, or null for the screen's own pace */
  fps: number | null;
}
export const EFFECT_PLAY: EffectPlay = { speed: 1, fps: null };

/** Whether an effect holds its first frame: no motion, nothing to play. */
export const isStill = (play: EffectPlay): boolean => play.speed === 0;

/** The blob's own look (blob.ts): whether it drifts near and far, whether three fill the box, how much frost, its
    shape (a number, or null for the palette's own) and the ground behind it (none, the palette's deep tone, a color). */
export interface BlobLook {
  depth: boolean;
  fill: boolean;
  frost: number;
  shape: number | null;
  bg: "deep" | `#${string}` | null;
}
export const BLOB_LOOK: BlobLook = { depth: true, fill: false, frost: 1, shape: null, bg: null };
export const BLOB_FROST_MAX = 2;
export const BLOB_SHAPE_MAX = 9999;

/** The name a blob's still goes by on a page (server/blob-still.ts, BlobLayer.tsx): its palette's seed and its look,
    which are all its first frame depends on. */
export const blobStillKey = (seed: string, look: BlobLook): string =>
  [seed, look.depth ? 1 : 0, look.fill ? 1 : 0, look.frost, look.shape ?? "", look.bg ?? ""].join(
    "|"
  );

/** A still's name read back, or null for one no page wrote. */
export function readBlobStillKey(key: string): { seed: string; look: BlobLook } | null {
  const parts = key.split("|");
  if (parts.length !== 6) return null;
  const [seed, depth, fill, frost, shape, bg] = parts;
  if (!/^[\w-]{2,}$/.test(seed) || !/^[01]$/.test(depth) || !/^[01]$/.test(fill)) return null;
  const look = blobLook({
    depth: depth === "1",
    fill: fill === "1",
    frost: Number(frost),
    shape: shape === "" ? null : Number(shape),
    bg: bg === "" ? null : (bg as BlobLook["bg"])
  });
  return blobStillKey(seed, look) === key ? { seed, look } : null;
}

/** The shape number a palette suggests for its blob: the same for the same palette, so a blob whose address names no
    shape is drawn alike by the server, the editor and every reload. */
export const blobShapeOf = (seed: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return (h >>> 0) % (BLOB_SHAPE_MAX + 1);
};

/** An effect's settings: how it plays, and the blob's look, which the glass leaves as it is. */
export interface EffectSettings extends EffectPlay {
  look: BlobLook;
}

/** An effect as an address carries it. */
export interface Effect extends EffectSettings {
  kind: EffectKind;
}

/** A blob's look as stored or asked for: each part in its bounds. */
export function blobLook(v: Partial<BlobLook> | null | undefined): BlobLook {
  const frost = Number(v?.frost);
  const shape = Number(v?.shape);
  const bg = typeof v?.bg === "string" ? v.bg.toLowerCase() : null;
  return {
    depth: v?.depth !== false,
    fill: v?.fill === true,
    frost: Number.isFinite(frost) ? clamp(Math.round(frost * 100) / 100, 0, BLOB_FROST_MAX) : 1,
    shape:
      v?.shape === null || v?.shape === undefined || !Number.isFinite(shape)
        ? null
        : clamp(Math.round(shape), 0, BLOB_SHAPE_MAX),
    bg: bg === "deep" ? "deep" : bg && /^#[0-9a-f]{6}$/.test(bg) ? (bg as `#${string}`) : null
  };
}

/** A speed as the address keeps it: 0, or two decimals from `slowest` to `max`; 1 for anything no number. */
export const effectSpeed = (value: unknown): number => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 1;
  const kept = Math.round(n * 100) / 100;
  return kept === 0 ? 0 : clamp(kept, EFFECT_SPEED.slowest, EFFECT_SPEED.max);
};
/** Frames a second as the address keeps them: a whole number from 1 to EFFECT_FPS_MAX, or null. */
export const effectFps = (value: unknown): number | null => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, EFFECT_FPS_MAX) : null;
};

/** The effect an address asks for, or null where its style is a gradient's or none. */
export function parseEffect(params: ParamReader): Effect | null {
  const kind = params.get("style");
  if (!isEffect(kind)) return null;
  const speed = params.get("speed");
  const shape = params.get("shape");
  const frost = params.get("frost");
  const raw = params.get("bg")?.toLowerCase().replace(/^#/, "") ?? "";
  const hex = /^[0-9a-f]{6}$/.test(raw)
    ? raw
    : /^[0-9a-f]{3}$/.test(raw)
      ? raw.replace(/./g, c => c + c)
      : null;
  return {
    kind,
    speed: speed === null ? 1 : effectSpeed(speed),
    fps: effectFps(params.get("fps")),
    look:
      kind === "blob"
        ? blobLook({
            depth: params.get("depth") !== "0",
            fill: params.get("fill") === "1",
            frost: frost !== null && /^\d+(\.\d+)?$/.test(frost) ? Number(frost) : 1,
            shape: shape !== null && /^\d{1,4}$/.test(shape) ? Number(shape) : null,
            bg: raw === "deep" ? "deep" : hex ? `#${hex}` : null
          })
        : BLOB_LOOK
  };
}

/** The effect's parts of an address after its style, defaults left out, in one order: how it plays, then the blob's
    look. A ground color is written with its `#` (escaped), so no color reads as a number. */
export const effectParts = (effect: Effect): string[] => {
  const look = effect.look;
  return [
    effect.speed !== 1 && `speed=${effect.speed}`,
    effect.fps !== null && `fps=${effect.fps}`,
    ...(effect.kind === "blob"
      ? [
          !look.depth && "depth=0",
          look.fill && "fill=1",
          look.frost !== 1 && `frost=${look.frost}`,
          look.shape !== null && `shape=${look.shape}`,
          look.bg && `bg=${look.bg.replace("#", "%23")}`
        ]
      : [])
  ].filter((part): part is string => Boolean(part));
};

/** Whether two settings are the same. */
export const sameSettings = (a: EffectSettings, b: EffectSettings): boolean =>
  a.speed === b.speed &&
  a.fps === b.fps &&
  a.look.depth === b.look.depth &&
  a.look.fill === b.look.fill &&
  a.look.frost === b.look.frost &&
  a.look.shape === b.look.shape &&
  a.look.bg === b.look.bg;
