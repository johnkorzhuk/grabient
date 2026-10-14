import { isServer } from "@solidjs/web";
import { createMemo, createSignal, flush, isHydrating, onCleanup, onSettled } from "solid-js";

/* A window over a long column of blocks: only the blocks within a screen of the viewport are drawn, and padding on
   the column's host stands in for the rest, so the host is as tall as the whole list and a block joining at the end
   moves nothing. Rows of equal cards are blocks of one measured height; a feed's groups have heights of their own,
   measured once drawn and estimated before (createHeights).

   The server draws a column's first blocks. The first of them are hydrated and the rest stay the server's still
   markup, which costs a page's start nothing, until the reader moves (scrolls, points, presses a key) or the column is
   given blocks the server did not draw: then the window starts and draws live blocks where it stands, and the column's
   host grows to hold the new ones. A press or the focus that reaches a still block with no such move (a
   screen reader's own cursor) starts it too, and lands on the same control of the live block (wake). A column made
   after a navigation is windowed from its first frame, at the depth a return is about to restore and with the room
   its kind had last time, so a list returned to stands at its depth at once. The page a window stands in turns the
   browser's scroll anchoring off (AppPage's `feed`): the window places its blocks itself. */

export interface WindowRoom {
  /** where the column starts in the document, and how wide it is: kept by its kind across mounts */
  top: number;
  width: number;
}

export interface WindowOptions {
  /** how many blocks the column holds at its width */
  count: (width: number) => number;
  /** a block's height at the column's width, measured or estimated */
  size: (index: number, width: number) => number;
  /** the space between two blocks */
  gap: () => number;
  /** the blocks the server draws, live or still */
  initial: (width: number) => number;
  /** whether the column holds only the blocks the server drew: the still ones cannot change, so a column given others
      (a page joined, another answer) is windowed then */
  drawn?: () => boolean;
  /** the depth a return is about to restore, read for the first window alone */
  depth?: number;
  room: WindowRoom;
  /** how many screens the window reaches past the viewport either way */
  overscan?: number;
}

/** The room a column is laid out in before it is measured: the server's guess, a desktop's. */
const DEFAULT_WIDTH = 1424;
/** What the reader does that starts a window the page began with: a still block would not answer it. */
const MOVES = [
  "scroll",
  "wheel",
  "pointerover",
  "pointerdown",
  "touchstart",
  "keydown",
  "resize"
] as const;

export function createWindow(o: WindowOptions) {
  let host: HTMLElement | undefined;
  const overscan = o.overscan ?? 1;
  const [view, setView] = createSignal({
    y: isServer ? 0 : (o.depth ?? scrollY),
    h: isServer ? 900 : innerHeight,
    top: o.room.top,
    width: o.room.width
  });
  /* a column drawn by the server waits for the reader, or for blocks it did not draw; one made in the browser is
     windowed at once */
  const [moved, setMoved] = createSignal(!isServer && !isHydrating());
  const started = createMemo((was?: boolean) => !!was || moved() || !(o.drawn?.() ?? true));
  /* the width blocks are laid out at: the last one read, or a desktop's before any was */
  const width = () => view().width || DEFAULT_WIDTH;
  /* where each block starts, and past the last, where the column would end with one more gap */
  const offsets = createMemo(() => {
    const w = width();
    const n = o.count(w);
    const gap = o.gap();
    const at = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) at[i + 1] = at[i]! + o.size(i, w) + gap;
    return at;
  });
  const range = createMemo((): readonly [number, number] => {
    const n = offsets().length - 1;
    if (!started()) return [0, Math.min(n, o.initial(width()))];
    if (!n) return [0, 0];
    const at = offsets();
    const gap = o.gap();
    const v = view();
    const from = v.y - v.top - v.h * overscan;
    const to = v.y - v.top + v.h * (1 + overscan);
    let start = 0;
    while (start < n - 1 && at[start + 1]! - gap <= from) start++;
    let end = start + 1;
    while (end < n && at[end]! < to) end++;
    return [start, end];
  });
  const before = () => offsets()[range()[0]]!;
  const after = () => {
    const at = offsets();
    return at[at.length - 1]! - at[range()[1]]!;
  };

  /** Reads where the column stands and the viewport; a hidden column keeps the last it read. */
  const read = (y = scrollY) => {
    if (!host?.getClientRects().length) return;
    o.room.top = host.getBoundingClientRect().top + scrollY;
    o.room.width = host.clientWidth;
    setView({ y, h: innerHeight, top: o.room.top, width: o.room.width });
  };
  const start = () => {
    for (const move of MOVES) removeEventListener(move, start, true);
    read();
    setMoved(true);
  };
  onSettled(() => {
    let frame = 0;
    const soon = () => {
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0;
          read();
        });
      }
    };
    addEventListener("scroll", soon, { passive: true });
    addEventListener("resize", soon);
    const resized = new ResizeObserver(soon);
    if (host) resized.observe(host);
    read(o.depth ?? scrollY);
    if (!started())
      for (const move of MOVES) addEventListener(move, start, { capture: true, passive: true });
    return () => {
      for (const move of MOVES) removeEventListener(move, start, true);
      removeEventListener("scroll", soon);
      removeEventListener("resize", soon);
      resized.disconnect();
      cancelAnimationFrame(frame);
    };
  });

  return {
    /** the column's host, which carries the padding */
    ref: (el: HTMLElement) => {
      host = el;
    },
    range,
    before,
    after,
    /** the column's width as last read: what its columns are counted from */
    width,
    /** whether the window has started: until then the server's blocks stand */
    started,
    /** The server's still blocks as they are drawn: a press or the focus that reaches one of their controls without
        the reader having moved starts the window at once and lands on the same control of the live block, found by
        its block's place and its own name. */
    wake: (still: HTMLElement) => {
      const twin = (target: EventTarget | null): HTMLElement | undefined => {
        const control = (target as HTMLElement | null)?.closest<HTMLElement>("a, button");
        const block = control?.closest("article");
        if (!host || !control || !block) return undefined;
        const at = [...host.querySelectorAll("article")].indexOf(block);
        const name = control.getAttribute("aria-label");
        start();
        flush();
        const live = host.querySelectorAll("article")[at];
        return [...(live?.querySelectorAll<HTMLElement>(control.tagName) ?? [])].find(
          again => again.getAttribute("aria-label") === name
        );
      };
      still.addEventListener("focusin", e => twin(e.target)?.focus({ preventScroll: true }));
      /* a link leads where it leads, still or live: only a press that needs its handler is passed on */
      still.addEventListener("click", e => {
        if ((e.target as HTMLElement).closest("button")) twin(e.target)?.click();
      });
    },
    /** reads the column again, after what stands above it changed its place */
    remeasure: () => read()
  };
}

/** Heights of blocks by key, measured as they are drawn and kept across mounts by their kind, so a feed returned to
    lays out as it stood. `measure(key)` is a ref, made in the block's own scope so its observation ends with it. */
export function createHeights(kept: Map<string, number>) {
  const [version, setVersion] = createSignal(0);
  const keys = new WeakMap<Element, string>();
  const observer = isServer
    ? null
    : new ResizeObserver(entries => {
        let changed = false;
        for (const entry of entries) {
          const key = keys.get(entry.target);
          const height = Math.round(entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height);
          if (key && height && kept.get(key) !== height) {
            kept.set(key, height);
            changed = true;
          }
        }
        // a bound on what is kept: a long session meets thousands of groups
        if (kept.size > 2000) kept.clear();
        if (changed) setVersion(n => n + 1);
      });
  onCleanup(() => observer?.disconnect());
  return {
    /** a block's measured height, or none yet */
    of: (key: string): number | undefined => {
      version();
      return kept.get(key);
    },
    measure: (key: string) => {
      let el: Element | undefined;
      onCleanup(() => {
        if (el) observer?.unobserve(el);
      });
      return (node: HTMLElement) => {
        el = node;
        keys.set(node, key);
        observer?.observe(node);
      };
    }
  };
}
