import { decodePalette } from "@grabient/engine/codec.ts";
import { blobShapeOf, type Effect, effectParts, parseEffect } from "@grabient/engine/effect.ts";
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
  sizeParam
} from "@grabient/engine/view.ts";
import { isServer } from "@solidjs/web";
import { type Accessor, createContext, createSignal } from "solid-js";
import type { Drawn } from "../../lib/palette.ts";
import { seedAddress } from "../editor/address.ts";

/* The view a list draws its palettes in: style, steps and angle for every palette at once, each set or left to every
   palette's own (auto, As saved), the size a palette takes into the editor and the selection's files, and an effect
   every card plays in its gradient's place. It is the list's address (?style=…&steps=…&angle=…&size=…, or with an
   effect ?style=glass|blob&angle=…&size=… and how it plays and looks, as a palette's address writes them), so a change
   replaces the entry and Back leaves the page, and the tab remembers it for the next page that draws palettes, the
   editor's new palettes and the wordmark's way home.

   While Steps or Angle is being set, the pictures draw the value at once (the draft) and the route takes it once the
   change rests; a tile the pointer rests on previews its style on every card (the peek). The frame holds both, since
   the control that sets them stands in the header and the cards that draw them in the page. */

export interface ListView {
  style: StyleChoice;
  steps: number | "auto";
  angle: number | "auto";
  size: SizeChoice | null;
  /** the effect every card plays over its gradient, which the names, the likes, the selection and the files keep: how
      it plays and the blob's frost and ground, one for the list. Its shape is none: each card plays its own palette's
      (cardEffect). The style is auto and the steps leave the address while one plays. */
  effect: Effect | null;
}
/** Steps, an angle or how the effect plays being set, which the pictures draw before the route takes them. */
export type ViewDraft = Partial<Pick<ListView, "steps" | "angle" | "effect">>;

/** Every palette in its own view. */
export const AS_SAVED: ListView = {
  style: "auto",
  steps: "auto",
  angle: "auto",
  size: null,
  effect: null
};

const whole = (value: unknown, min: number, max: number): number | null => {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= min && n <= max ? n : null;
};

/** The parameters a list's view is read from, in the order its address writes them. */
export const VIEW_PARAMS = ["style", "steps", "angle", "size", "speed", "fps", "frost", "bg"];

/** The view a list's address names; what it leaves out or cannot read is auto. Steps under three are three. An
    effect's style names it, read as a palette's address reads it (engine/effect.ts), less its shape. */
export function readListView(search: Readonly<Record<string, unknown>>): ListView {
  const said = (name: string) => {
    const value = search[name];
    const one = Array.isArray(value) ? value[0] : value;
    return one === undefined || one === null ? null : String(one);
  };
  const effect = parseEffect({ get: said });
  const steps = whole(search.steps, 1, STEPS_MAX);
  const angle = whole(search.angle, 0, 360);
  return {
    style: isStyle(search.style) ? search.style : "auto",
    steps: effect || steps === null ? "auto" : Math.max(steps, STEPS_MIN),
    angle: angle ?? "auto",
    size: typeof search.size === "string" ? parseSize(search.size) : null,
    effect: effect && { ...effect, look: { ...effect.look, shape: null } }
  };
}

/** The view an address's query names, each parameter as it stands first. */
export const listViewOf = (params: URLSearchParams): ListView =>
  readListView(Object.fromEntries(VIEW_PARAMS.map(name => [name, params.get(name)])));

/** A list's own view over the one a pasted link draws in: each part the list leaves to every palette takes the
    link's, its style and its effect as one. */
export const viewOver = (own: ListView, said: ListView): ListView => {
  const styled = own.style !== "auto" || own.effect !== null;
  return {
    style: styled ? own.style : said.style,
    effect: styled ? own.effect : said.effect,
    steps: own.steps === "auto" && !own.effect ? said.steps : own.steps,
    angle: own.angle === "auto" ? said.angle : own.angle,
    size: own.size ?? said.size
  };
};

/* an effect's parameters after the angle and the size, as a palette's address writes them, each one there: the
   numbers as numbers, which the router writes unquoted */
function effectParams(effect: Effect | null): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = {
    speed: undefined,
    fps: undefined,
    frost: undefined,
    bg: undefined
  };
  for (const part of effect ? effectParts(effect) : []) {
    const [name, value] = part.split("=");
    out[name] = name === "bg" ? decodeURIComponent(value) : Number(value);
  }
  return out;
}

/** A view as a list's search params, ready to merge over the address's: auto is no param. The style and the effect
    are written together, one `style` naming either, and the steps leave while an effect plays. */
export function viewParams(view: Partial<ListView>): Record<string, string | number | undefined> {
  const out: Record<string, string | number | undefined> = {};
  const effect = view.effect ?? null;
  const styled = "style" in view || "effect" in view;
  if (styled) out.style = effect ? effect.kind : view.style === "auto" ? undefined : view.style;
  if ("steps" in view || effect)
    out.steps = effect || view.steps === "auto" ? undefined : view.steps;
  if ("angle" in view) out.angle = view.angle === "auto" ? undefined : view.angle;
  if ("size" in view) out.size = sizeParam(view.size) ?? undefined;
  return styled ? { ...out, ...effectParams(effect) } : out;
}

/** A list's search with a change over its own, in the lists' one order: the words, the view, whatever else the
    address says, then the selection. An address written in another order is one the Worker redirects on a reload. */
export function inOrder(
  search: Readonly<Record<string, unknown>>,
  change: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  const { q, style, steps, angle, size, speed, fps, frost, bg, selection, ...rest } = {
    ...search,
    ...change
  };
  return { q, style, steps, angle, size, speed, fps, frost, bg, ...rest, selection };
}

/** The effect a card plays: the list's, in its palette's own shape. The glass's is its design; the blob's is the one
    its seed suggests, which the editor settles a blob with none to, so a card plays the blob its link opens. */
export const cardEffect = (effect: Effect, seed: string): Effect =>
  effect.kind === "blob"
    ? { ...effect, look: { ...effect.look, shape: blobShapeOf(seed) } }
    : effect;

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
/* the view of the list the document opened on, which it drew before the memory was live */
let opened: ListView | null = null;

/** The reader's view, as this tab remembers it. */
export const rememberedView = remembered;

/** Reads the tab's memory once the page is live. A document that opened on a list takes that list's view over the
    one kept, As saved included: its address is what the reader sees. */
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
  if (opened) rememberView(opened);
}

/** Remembers the view a page drew its palettes in. */
export function rememberView(view: ListView): void {
  if (isServer) return;
  if (!live) {
    opened = view;
    return;
  }
  if (inView("", kept) === inView("", view)) return;
  kept = view;
  setRemembered(view);
  try {
    sessionStorage.setItem(KEY, JSON.stringify(view));
  } catch {
    /* the page still remembers it */
  }
}

/** The view a list takes when Back or Forward returns to it: its address's own, with each choice the reader made
    since the entry was left as it stands now, a cleared one included. `left` is what the tab remembered at the
    leaving; with no record of it every choice counts. */
export function viewSince(own: ListView, left: ListView | undefined, now: ListView): ListView {
  const was = left && viewParams(left);
  const is = viewParams(now);
  const made = (...names: string[]) => !was || names.some(name => was[name] !== is[name]);
  /* the style and the effect are one choice, as one `style` names either */
  const look = made("style", "speed", "fps", "frost", "bg");
  return {
    style: look ? now.style : own.style,
    steps: made("steps") ? now.steps : own.steps,
    angle: made("angle") ? now.angle : own.angle,
    size: made("size") ? now.size : own.size,
    effect: look ? now.effect : own.effect
  };
}

/* What the tab remembered when each history entry was left, by the entry's place in the history, for the entries
   this document has shown: the last of them, as many as a browser keeps to go back to. */
const ENTRIES_KEPT = 100;
const leftWith = new Map<number, ListView>();
let entry = 0;
let returned: { left: ListView | undefined; now: ListView } | null = null;

/** The history moved to the entry at `at`: `pushed` after the one on screen, or `returned` to by Back or Forward.
    Neither is the document's first entry or one replaced, which leave no entry. */
export function landView(at: number, how?: "pushed" | "returned"): void {
  returned = null;
  if (how) {
    // set again, an entry moves to the end, so the first is the one left longest ago
    leftWith.delete(entry);
    leftWith.set(entry, kept);
    if (leftWith.size > ENTRIES_KEPT) leftWith.delete(leftWith.keys().next().value!);
    if (how === "returned") returned = { left: leftWith.get(at), now: kept };
    // a push takes the place of every entry after the one left
    else for (const later of [...leftWith.keys()]) if (later >= at) leftWith.delete(later);
  }
  entry = at;
}

/** The view a list that Back or Forward returned to takes over its address's own, once: null where the address has
    it already, or the page was reached another way. */
export function returnedView(own: ListView): ListView | null {
  const since = returned;
  returned = null;
  if (!since) return null;
  const view = viewSince(own, since.left, since.now);
  return inView("", view) === inView("", own) ? null : view;
}

/** A page that draws palettes, in the reader's view: `/palettes` with the style or the effect, steps, angle and size
    remembered. */
export function inView(path: string, view: ListView = remembered()): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(viewParams(view)))
    if (value !== undefined) params.set(name, String(value));
  return params.size ? `${path}?${params}` : path;
}

/** A palette's page in the reader's view: what they set for every palette over the editor's own defaults, which its
    address leaves out, and the effect they set, playing in the palette's own shape. */
export function newPaletteHref(seed: string): string {
  const view = remembered();
  return seedAddress({
    seed,
    view: {
      style: view.style === "auto" ? DEFAULT_STYLE : view.style,
      steps: Math.max(view.steps === "auto" ? DEFAULT_STEPS : view.steps, keyframesOf(seed)),
      angle: view.angle === "auto" ? DEFAULT_ANGLE : view.angle,
      size: view.size
    },
    effect: view.effect && cardEffect(view.effect, seed)
  });
}
