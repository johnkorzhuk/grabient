import { decodePalette } from "@grabient/engine/codec.ts";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  effectiveView,
  isStyle,
  parseSize,
  type SizeChoice,
  STEPS_MAX,
  STEPS_MIN,
  type Style,
  type StyleChoice,
  sizeParam,
  viewSearch
} from "@grabient/engine/view.ts";
import { isServer } from "@solidjs/web";
import { type Accessor, createContext, createSignal } from "solid-js";
import type { Drawn } from "../../lib/palette.ts";

/* The view a list draws its palettes in: style, steps and angle for every palette at once, each set or left to every
   palette's own (auto, As saved), and the size a palette takes into the editor and the selection's files. It is the
   list's address (?style=…&steps=…&angle=…&size=…), so a change replaces the entry and Back leaves the page, and the
   tab remembers it for the next page that draws palettes, the editor's new palettes and the wordmark's way home.

   While Steps or Angle is being set, the pictures draw the value at once (the draft) and the route takes it once the
   change rests; a tile the pointer rests on previews its style on every card (the peek). The frame holds both, since
   the control that sets them stands in the header and the cards that draw them in the page. */

export interface ListView {
  style: StyleChoice;
  steps: number | "auto";
  angle: number | "auto";
  size: SizeChoice | null;
}
/** Steps or angle being set, which the pictures draw before the route takes them. */
export type ViewDraft = Partial<Pick<ListView, "steps" | "angle">>;

/** Every palette in its own view. */
export const AS_SAVED: ListView = { style: "auto", steps: "auto", angle: "auto", size: null };

const whole = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** The view a list's address names; what it leaves out or cannot read is auto. Steps under three are three. */
export function readListView(search: Readonly<Record<string, unknown>>): ListView {
  const steps = whole(search.steps, 1, STEPS_MAX);
  const angle = whole(search.angle, 0, 360);
  return {
    style: isStyle(search.style) ? search.style : "auto",
    steps: steps === null ? "auto" : Math.max(steps, STEPS_MIN),
    angle: angle ?? "auto",
    size: typeof search.size === "string" ? parseSize(search.size) : null
  };
}

/** A view as a list's search params, ready to merge over the address's: auto is no param. */
export function viewParams(view: Partial<ListView>): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = {};
  if ("style" in view) out.style = view.style === "auto" ? undefined : view.style;
  if ("steps" in view) out.steps = view.steps === "auto" ? undefined : view.steps;
  if ("angle" in view) out.angle = view.angle === "auto" ? undefined : view.angle;
  if ("size" in view) out.size = sizeParam(view.size) ?? undefined;
  return out;
}

/** A list's search with a change over its own, in the lists' one order: the words, the view, whatever else the
    address says, then the selection. An address written in another order is one the Worker redirects on a reload. */
export function inOrder(
  search: Readonly<Record<string, unknown>>,
  change: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const { q, style, steps, angle, size, selection, ...rest } = { ...search, ...change };
  return { q, style, steps, angle, size, ...rest, selection };
}

/* each seed's keyframe count, read once: a change of the view reads every card's palette again */
const KEYFRAMES_KEPT = 2048;
const keyframes = new Map<string, number>();
function keyframesOf(seed: string): number {
  let n = keyframes.get(seed);
  if (n === undefined) {
    n = decodePalette(seed)?.anchors.length ?? 2;
    if (keyframes.size >= KEYFRAMES_KEPT) keyframes.delete(keyframes.keys().next().value!);
    keyframes.set(seed, n);
  }
  return n;
}

/** A palette as a list draws it: the list's view over the palette's own, a draft over both, and never fewer steps
    than keyframes. */
export function drawnIn(own: Drawn, view: ListView, draft?: ViewDraft | null): Drawn {
  const v = effectiveView(own, {
    style: view.style,
    steps: draft?.steps ?? view.steps,
    angle: draft?.angle ?? view.angle
  });
  return { seed: own.seed, ...v, steps: Math.max(v.steps, keyframesOf(own.seed)) };
}

/** The peek and the draft the frame holds for the page's cards, and the page's first palette for the control's
    swatch. */
export function createAppearance(first: Accessor<Drawn | null>) {
  const [peek, setPeek] = createSignal<Style | null>(null);
  const [draft, setDraft] = createSignal<ViewDraft | null>(null);
  return { first, peek, setPeek, draft, setDraft };
}
export const AppearanceContext = createContext<ReturnType<typeof createAppearance>>();

/* The tab's memory of the reader's view, in sessionStorage: what the last page that drew palettes was drawn in. Until
   the page is live it is As saved on both sides, so the server's links and the first render's agree. */
const KEY = "grabient-view";
const [remembered, setRemembered] = createSignal<ListView>(AS_SAVED);
/* the same view, plain: a page's effect compares against it without reading the signal */
let kept: ListView = AS_SAVED;
let live = false;

/** The reader's view, as this tab remembers it. */
export const rememberedView = remembered;

/** Reads the tab's memory once the page is live. */
export function recallView(): void {
  if (isServer || live) return;
  live = true;
  try {
    const stored = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    if (stored && typeof stored === "object") {
      kept = readListView(viewParams(stored));
      setRemembered(kept);
    }
  } catch {
    /* nothing kept, or storage refused: As saved */
  }
}

/** Remembers the view a page drew its palettes in. */
export function rememberView(view: ListView): void {
  if (isServer || !live) return;
  if (
    kept.style === view.style &&
    kept.steps === view.steps &&
    kept.angle === view.angle &&
    sizeParam(kept.size) === sizeParam(view.size)
  )
    return;
  kept = view;
  setRemembered(view);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    /* the page still remembers it */
  }
}

/** A page that draws palettes, in the reader's view: `/palettes` with the style, steps, angle and size remembered. */
export function inView(path: string, view: ListView = remembered()): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(viewParams(view)))
    if (value !== undefined) params.set(name, String(value));
  return params.size ? `${path}?${params}` : path;
}

/** A palette's page in the reader's view: what they set for every palette over the editor's own defaults, which its
    address leaves out. */
export function newPaletteHref(seed: string): string {
  const view = remembered();
  return `/${seed}${viewSearch({
    style: view.style === "auto" ? DEFAULT_STYLE : view.style,
    steps: Math.max(view.steps === "auto" ? DEFAULT_STEPS : view.steps, keyframesOf(seed)),
    angle: view.angle === "auto" ? DEFAULT_ANGLE : view.angle,
    size: view.size
  })}`;
}
