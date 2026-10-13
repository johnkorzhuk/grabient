import { reducesNow } from "./motion.ts";

/* The bar a pane wears along its top edge (Pane `bar`), for the water behind the page. On each frame the water draws it
   hands in the colors its open bar shows, and the strip is painted with them, so it changes as smoothly as the
   wordmark's bar; the water takes those colors in along the strip as smoke that rises off the pane. At rest the strip
   keeps DULL of its color. While its pane is hovered or holds the focus, the light comes on from the strip's middle to
   its ends; let go, the ends dim first and the middle last, more slowly. The light follows the pane critically damped,
   at the display's rate: it moves on the first frame, never overshoots, and turns back from wherever it is, so a
   passing pointer never flickers it. One strip at a time, the last one shown. Browser only. */
const DULL = 0.4;
/** How far the strip's ends trail its middle as the light comes on, and lead it as it goes, of the whole way. */
export const BLOOM = 0.4;
/* seconds the light takes to close most of the way: on in about half a second, off in about eight tenths */
const ON = 0.2;
const OFF = 0.33;
const STOPS = 16;
const EVENTS = ["pointerenter", "pointerleave", "focusin", "focusout"] as const;

let worn: HTMLElement | null = null;
let pane: HTMLElement | null = null;
/* the colors the water handed in last (its own buffer, refilled each frame) and the strip it paints */
let source: Uint8Array | null = null;
let painted: HTMLElement | null = null;
let lit = 0;
let speed = 0;
let raf = 0;
let last = 0;
const LIVE = "--bar-live";
const lighted = () => !!pane?.matches(":hover, :focus-within");
/* the strip's own colors and fade come back */
function unpaint(el: HTMLElement) {
  el.style.removeProperty(LIVE);
  el.style.removeProperty("opacity");
  el.style.removeProperty("transition-property");
}
/* the strip now: each stop the bar's color, as lit as its place along the light allows */
function paint() {
  if (!painted || !source) return;
  const n = source.length / 3;
  let css = "linear-gradient(90deg";
  for (let k = 0; k <= STOPS; k++) {
    const u = k / STOPS;
    const i = Math.round(u * (n - 1)) * 3;
    const on = Math.min(Math.max(lit * (1 + BLOOM) - BLOOM * Math.abs(2 * u - 1), 0), 1);
    css += `, rgb(${source[i]} ${source[i + 1]} ${source[i + 2]} / ${(DULL + (1 - DULL) * on).toFixed(3)})`;
  }
  painted.style.setProperty(LIVE, `${css})`);
}
/* one frame of the light following the pane: a critically damped step (Game Programming Gems 4, 8.1), exact at any
   frame rate; its targets are its bounds, so holding it inside them is all the overshoot guard it needs */
function tick(now: number) {
  raf = 0;
  if (!painted || !source) return;
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
  last = now;
  const target = lighted() ? 1 : 0;
  if (reducesNow()) {
    lit = target;
    speed = 0;
  } else {
    const w = 2 / (target > lit ? ON : OFF);
    const x = w * dt;
    const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = lit - target;
    const temp = (speed + w * change) * dt;
    speed = (speed - w * temp) * e;
    lit = target + (change + temp) * e;
    if (lit <= 0 || lit >= 1) {
      lit = Math.min(Math.max(lit, 0), 1);
      speed = 0;
    }
  }
  const settled = Math.abs(lit - target) < 1e-3 && Math.abs(speed) < 1e-3;
  if (settled) {
    lit = target;
    speed = 0;
  }
  paint();
  if (settled) last = 0;
  else raf = requestAnimationFrame(tick);
}
const wake = () => {
  if (!raf && painted && source) raf = requestAnimationFrame(tick);
};

/** A pane's bar is on the page. */
export function barWorn(el: HTMLElement): void {
  if (worn && worn !== el) barGone(worn);
  worn = el;
  pane = el.parentElement;
  for (const type of EVENTS) pane?.addEventListener(type, wake);
}
/** A pane's bar has left the page. */
export function barGone(el: HTMLElement): void {
  if (worn !== el) return;
  for (const type of EVENTS) pane?.removeEventListener(type, wake);
  if (painted === el) {
    unpaint(el);
    painted = null;
  }
  worn = null;
  pane = null;
}
/** The pane's bar on the page, if any. */
export function paneBar(): HTMLElement | null {
  if (worn && !worn.isConnected) barGone(worn);
  return worn;
}
/** How lit the pane's bar is now, 0 at rest to 1. */
export const barLight = (): number => lit;
/** The water paints the strip: the paint at its source as sRGB byte triples across the bar. A strip it begins to paint
    takes its pane's light at once, and its own fade stands aside. */
export function paintBar(colors: Uint8Array): void {
  const el = paneBar();
  if (!el || colors.length < 6) return;
  source = colors;
  if (painted !== el) {
    if (painted) unpaint(painted);
    painted = el;
    lit = lighted() ? 1 : 0;
    speed = 0;
    el.style.setProperty("opacity", "1");
    el.style.setProperty("transition-property", "none");
  }
  paint();
  /* a change the pane's events missed, such as the page scrolling it under a still pointer */
  if ((lighted() ? 1 : 0) !== lit || speed !== 0) wake();
}
/** The water stopped painting: the strip shows its own colors again. */
export function barUnpainted(): void {
  if (painted) unpaint(painted);
  painted = null;
  source = null;
  cancelAnimationFrame(raf);
  raf = 0;
  last = 0;
}
