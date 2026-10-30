/* The blob in the editor: whether the picture plays the palette as the animated blob (engine/blob.ts) and how. It is the
   reader's, kept in this browser like the side's panel, and goes for every palette the editor opens. In the editor the
   blob always has a shape number, so a drag that recolors the palette keeps the blob it is looking at: the files it
   copies and links carry that number, and draw the same blob. */
import type { BlobView } from "@grabient/engine/blob.ts";
import { clamp } from "@grabient/engine/math.ts";
import { createSignal, onSettled } from "solid-js";

/* engine/blob.ts's bounds, written here so the editor's first load carries none of the blob's drawing: the stage loads
   that once the blob is turned on (BlobStage) */
export const SPEED = { min: 0.1, max: 10 };
export const FROST_MAX = 2;
export const SHAPE_MAX = 9999;
export const FPS_MAX = 60;
const DEFAULT: BlobView = {
  speed: 1,
  depth: true,
  fill: false,
  frost: 1,
  shape: null,
  bg: null,
  still: false,
  fps: null
};

const KEY = "grabient-blob";

export interface BlobSettings {
  on: () => boolean;
  setOn: (on: boolean) => void;
  /** the blob's view, its shape always a number */
  view: () => BlobView;
  set: (part: Partial<BlobView>) => void;
  /** a new shape number, other than the one shown */
  shuffle: () => void;
}

/** A shape number the palette suggests, so a blob first turned on is the same for the same palette. */
const shapeOf = (seed: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  return (h >>> 0) % (SHAPE_MAX + 1);
};

/** The settings, read from this browser once the page is live: the server drew the page without them. */
export function createBlobSettings(seed: () => string): BlobSettings {
  const [on, setOnRaw] = createSignal(false);
  const [view, setView] = createSignal<BlobView>(DEFAULT);
  /* the settings as last written: a signal read in the same turn as its write can still give the value before it */
  let now = { on: false, view: DEFAULT };
  const write = (next: { on: boolean; view: BlobView }, keep = true) => {
    now = next;
    setOnRaw(next.on);
    setView(next.view);
    if (!keep) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ on: next.on, ...next.view }));
    } catch {}
  };
  /* a shape number, the palette's suggestion where none is set yet */
  const shaped = (v: BlobView): BlobView =>
    v.shape === null ? { ...v, shape: shapeOf(seed()) } : v;
  onSettled(() => {
    try {
      const kept = JSON.parse(localStorage.getItem(KEY) ?? "null") as
        | (Partial<BlobView> & { on?: boolean })
        | null;
      if (!kept) return;
      const v = sane({ ...now.view, ...kept });
      write({ on: kept.on === true, view: kept.on ? shaped(v) : v }, false);
    } catch {}
  });
  /* what a stored or set view may hold: each number in its bounds, the ground none, deep or a hex */
  const sane = (v: BlobView): BlobView => ({
    speed: clamp(Number(v.speed) || 1, SPEED.min, SPEED.max),
    depth: v.depth !== false,
    fill: v.fill === true,
    frost: clamp(Number.isFinite(Number(v.frost)) ? Number(v.frost) : 1, 0, FROST_MAX),
    shape:
      v.shape === null || v.shape === undefined
        ? null
        : clamp(Math.round(Number(v.shape)) || 0, 0, SHAPE_MAX),
    bg: v.bg === "deep" || (typeof v.bg === "string" && /^#[0-9a-f]{6}$/.test(v.bg)) ? v.bg : null,
    still: false,
    fps:
      v.fps === null || v.fps === undefined
        ? null
        : clamp(Math.round(Number(v.fps)) || 12, 1, FPS_MAX)
  });
  return {
    on,
    setOn(next) {
      write({ on: next, view: next ? shaped(now.view) : now.view });
    },
    view,
    set(part) {
      write({ on: now.on, view: sane({ ...now.view, ...part }) });
    },
    shuffle() {
      const was = now.view.shape ?? -1;
      let next = was;
      while (next === was) next = Math.floor(Math.random() * (SHAPE_MAX + 1));
      write({ on: now.on, view: { ...now.view, shape: next } });
    }
  };
}
