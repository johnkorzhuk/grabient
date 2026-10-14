/* The picture a search by image was made from, held in this tab alone (session storage) so a reload or Back finds it
   while the address asks for its colors, and nothing of it leaves the device. The search is the colors of its points,
   which the address names. A point moved reads its color again at once; the page searches once it rests, and each
   change that rests is one step of the page's undo. The server renders no picture: the page restores it after it
   settles. */
import { K_MAX, K_MIN } from "@grabient/engine";
import { labOf } from "@grabient/search/colors.ts";
import type { Pixels, Sample } from "@grabient/search/picture.ts";
import { createSignal } from "solid-js";

export interface Picture {
  src: string;
  width: number;
  height: number;
  /** the points in the palette's order, where they are now */
  points: Sample[];
  /** where they were read first, for Reset */
  first: Sample[];
  /** the colors the address was last given: the picture stands beside the search that asks for them */
  asks: string;
}

/** What a change that came to rest did: the points before and after it, and the colors the address now asks for. */
export interface Settled {
  before: Sample[];
  after: Sample[];
  colors: string;
}

const KEY = "grabient-picture";
const colorsOf = (points: readonly Sample[]) => points.map(p => p.hex).join(" ");
const same = (a: readonly Sample[], b: readonly Sample[]) =>
  a.length === b.length &&
  a.every((p, i) => p.hex === b[i].hex && p.x === b[i].x && p.y === b[i].y);
const apart = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** the color of a list nearest this one */
function nearestOf(hexes: readonly string[], hex: string): number {
  const c = labOf(hex);
  return hexes.reduce(
    (best, h, i) => (apart(labOf(h), c) < apart(labOf(hexes[best]), c) ? i : best),
    0
  );
}
/** where a color joins a list so the way through them grows least */
function placeOf(hexes: readonly string[], hex: string): number {
  const labs = hexes.map(labOf);
  const c = labOf(hex);
  let at = labs.length;
  let least = apart(labs[labs.length - 1], c);
  if (apart(c, labs[0]) < least) {
    at = 0;
    least = apart(c, labs[0]);
  }
  for (let i = 0; i + 1 < labs.length; i++) {
    const grows = apart(labs[i], c) + apart(c, labs[i + 1]) - apart(labs[i], labs[i + 1]);
    if (grows < least) {
      least = grows;
      at = i + 1;
    }
  }
  return at;
}

const image = () => import("./image.ts");
const keep = (picture: Picture) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(picture));
  } catch {
    // a full or blocked storage keeps it for this page only
  }
};

/** A page's held picture and what can be done to its points. Made once by a page that reads pictures. */
export function createPicture() {
  const [held, setHeld] = createSignal<Picture | null>(null);
  /* the picture as it is now: a signal shows a write a microtask later, and a release can follow a move closer than that */
  let current: Picture | null = null;
  const put = (picture: Picture | null) => {
    current = picture;
    setHeld(picture);
  };
  // the pixels a moved point reads from, made once per picture
  let pixels: { src: string; read: Promise<Pixels> } | null = null;
  const pixelsOf = (src: string) => {
    if (pixels?.src !== src)
      pixels = { src, read: image().then(module => module.pointPixels(src)) };
    return pixels.read;
  };
  // the points as the last change that rested left them, which the next one is measured from
  let rested: Sample[] = [];
  /* the colors asked for before the last change rested: the picture stands beside them too until the address reaches
     the new ones, so it never leaves the page between the two searches */
  let leaving: string | null = null;
  const asking = (picture: Picture, points: Sample[]): Picture => {
    const asks = colorsOf(points);
    if (asks !== picture.asks) leaving = picture.asks;
    return { ...picture, points, asks };
  };
  // moves are read in the order they came, and a rest waits for the last of them
  let moving: Promise<void> = Promise.resolve();
  const then = (work: () => Promise<void> | void) => {
    moving = moving.then(work).catch(() => {});
    return moving;
  };
  const colorAt = async (picture: Picture, x: number, y: number) => {
    const [read, { colorAt }] = await Promise.all([
      pixelsOf(picture.src),
      import("@grabient/search/picture.ts")
    ]);
    return colorAt(read, x, y);
  };
  const settle = async (): Promise<Settled | null> => {
    await moving;
    if (!current) return null;
    const before = rested.length ? rested : current.first;
    const after = current.points;
    const next = asking(current, after);
    put(next);
    keep(next);
    rested = after;
    return same(before, after) ? null : { before, after, colors: next.asks };
  };

  return {
    /** The picture whose colors this search asks for, or null. */
    pictureFor: (query: string): Picture | null => {
      const picture = held();
      if (picture?.asks === query) leaving = null;
      return picture && (picture.asks === query || leaving === query) ? picture : null;
    },
    /** Whether a point has moved from where it was read first. */
    moved: (picture: Picture): boolean =>
      picture.points.length !== picture.first.length ||
      picture.points.some((p, i) => p.x !== picture.first[i].x || p.y !== picture.first[i].y),
    /** A point can be added, or taken out: a palette holds two to eight colors. */
    canAdd: (picture: Picture): boolean => picture.points.length < K_MAX,
    canRemove: (picture: Picture): boolean => picture.points.length > K_MIN,

    /** Reads a picture file and holds it: the colors to search for, or null when the browser cannot read it. */
    async take(file: File): Promise<string | null> {
      const read = await image()
        .then(module => module.readImage(file))
        .catch(() => null);
      if (!read?.samples.length) return null;
      const picture: Picture = {
        src: read.src,
        width: read.width,
        height: read.height,
        points: read.samples,
        first: read.samples,
        asks: colorsOf(read.samples)
      };
      put(picture);
      keep(picture);
      rested = picture.points;
      leaving = null;
      void pixelsOf(picture.src);
      return picture.asks;
    },

    /** After the page settles, the picture this tab kept for a search, when it is this one. */
    restore(query: string): void {
      if (current?.asks === query) return;
      let kept: Picture | null = null;
      try {
        kept = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Picture | null;
      } catch {
        kept = null;
      }
      if (kept?.asks !== query || !Array.isArray(kept.points)) return;
      put(kept);
      rested = kept.points;
      void pixelsOf(kept.src);
    },

    /** A point moves: its color is read again under it. */
    move: (index: number, x: number, y: number) =>
      then(async () => {
        const picture = current;
        if (!picture) return;
        const hex = await colorAt(picture, x, y);
        const now = current;
        if (now?.src === picture.src)
          put({ ...now, points: now.points.map((p, i) => (i === index ? { hex, x, y } : p)) });
      }),

    /** A point added where the picture was double-clicked, where it lengthens the blend least; with eight already, it
        takes the place of the point whose color is nearest its own. */
    add: (x: number, y: number) =>
      then(async () => {
        const picture = current;
        if (!picture) return;
        const hex = await colorAt(picture, x, y);
        const now = current;
        if (now?.src !== picture.src) return;
        const point = { hex, x, y };
        const hexes = now.points.map(p => p.hex);
        if (now.points.length < K_MAX) {
          const at = placeOf(hexes, hex);
          put({ ...now, points: [...now.points.slice(0, at), point, ...now.points.slice(at)] });
        } else {
          const at = nearestOf(hexes, hex);
          put({ ...now, points: now.points.map((p, i) => (i === at ? point : p)) });
        }
      }),

    /** A point taken out. */
    remove: (index: number) =>
      then(() => {
        const now = current;
        if (now && now.points.length > K_MIN)
          put({ ...now, points: now.points.filter((_, i) => i !== index) });
      }),

    /** A change came to rest: what it did, or null when the points stand where they stood. */
    settle,

    /** The points back where they were read first. */
    async reset(): Promise<Settled | null> {
      await moving;
      if (!current) return null;
      put({ ...current, points: current.first });
      return settle();
    },

    /** The points as an undo or a redo puts them: the colors to search for. */
    show(points: Sample[]): string | null {
      if (!current) return null;
      const next = asking(current, points);
      put(next);
      keep(next);
      rested = points;
      return next.asks;
    }
  };
}

export type HeldPicture = ReturnType<typeof createPicture>;
