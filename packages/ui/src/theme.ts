import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";
import { reducesNow } from "./motion.ts";
import { motion, type Theme } from "./tokens.ts";

/* Light and dark. The tokens follow `data-theme` on <html>, which the head stamps before the first paint
   (themeScript): the reader's choice for this browser, else the device's scheme. System follows the device as it
   changes; Light and Dark stay whatever the device says. System is kept as no stored value.
   The signals start at the server's values (System on a dark device) on both sides, so hydration matches, and
   syncTheme() reads the page's own once it is live. They are written only in the browser.

   A change turns the whole page in one piece that cannot be interrupted (switchTheme). The new theme arrives out of the
   button pressed as a radial mask with a wide, soft edge over a still picture of the old page, so no part of the page
   flips at once and no hard line divides the two themes. The mask is base.css from the transition's first frame,
   never set from script, which can start a frame late and flash the other theme. With reduced motion the page
   dissolves. A press or key during a change is let go, so a held T turns the theme over one whole change at a time.
   Without view transitions, or on a hidden page, the theme changes at once. */
export type { Theme };
export type ThemeChoice = "system" | Theme;
/** Where a change comes from: the element pressed, a point, or nothing (the corner where the theme button stands). */
export type RevealFrom = Element | { x: number; y: number } | null | undefined;

const KEY = "grabient-theme";
/* where an older build kept the choice, still read so a returning reader keeps it */
const OLD_KEY = "theme";
const LIGHT = "(prefers-color-scheme: light)";

const [theme, setTheme] = createSignal<Theme>("dark");
const [choice, setChoice] = createSignal<ThemeChoice>("system");
const [device, setDevice] = createSignal<Theme>("dark");
const [changing, setChanging] = createSignal(false);
/* plain copies: a signal written now reads its old value until the write settles */
let chosen: ThemeChoice = "system";
let running = false;
let origin: (() => Element | null) | null = null;

/** The theme the page is in. */
export { theme };
/** What the reader chose for this browser. */
export const themeChoice = choice;
/** The device's own scheme: what System follows. */
export const deviceTheme = device;
/** Whether a change of theme is on screen now: the theme button's glyphs turn only then. */
export const themeChanging = changing;

const deviceNow = (): Theme => (matchMedia(LIGHT).matches ? "light" : "dark");
const pageTheme = (): Theme => {
  const stamp = document.documentElement.dataset.theme;
  return stamp === "light" || stamp === "dark" ? stamp : deviceNow();
};
function stored(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
function keep(next: ThemeChoice) {
  chosen = next;
  setChoice(next);
  try {
    if (next === "system") {
      localStorage.removeItem(KEY);
      localStorage.removeItem(OLD_KEY);
    } else localStorage.setItem(KEY, next);
  } catch {
    /* a browser that keeps no site data: the choice lasts as long as the page */
  }
}
/** The page in this theme at once; the choice stays as it is. */
function show(next: Theme) {
  setTheme(next);
  document.documentElement.dataset.theme = next;
}

let synced = false;
/** The page's own theme once it is live, with the reader's choice and the device's scheme, both followed from then
    on: a device that changes its scheme moves a page on System, and a choice made in another tab moves this one. */
export function syncTheme(): void {
  if (isServer || synced) return;
  synced = true;
  setTheme(pageTheme());
  chosen = stored();
  setChoice(chosen);
  setDevice(deviceNow());
  matchMedia(LIGHT).addEventListener("change", () => {
    const d = deviceNow();
    setDevice(d);
    if (chosen === "system" && d !== pageTheme()) switchTheme(() => show(d));
  });
  addEventListener("storage", e => {
    if (e.key !== KEY && e.key !== OLD_KEY && e.key !== null) return;
    chosen = stored();
    setChoice(chosen);
    const to = chosen === "system" ? deviceNow() : chosen;
    if (to !== pageTheme()) show(to);
  });
}

/** Where a key's change arrives from: the theme button, wherever the page draws it. */
export function setThemeOrigin(el: () => Element | null): void {
  origin = el;
}

/** The other theme, chosen outright and kept (the T key, the header's button). Returns it, or null when a change was
    already on screen and this press was let go. */
export function toggleTheme(from?: RevealFrom): Theme | null {
  const next: Theme = pageTheme() === "dark" ? "light" : "dark";
  if (!switchTheme(() => show(next), from ?? origin?.())) return null;
  keep(next);
  return next;
}

/** The reader's choice in Settings: the page changes to what it means, arriving out of `from`, and the choice is kept.
    False when a change was already on screen and this press was let go, choice and all. */
export function setThemeChoice(next: ThemeChoice, from?: RevealFrom): boolean {
  const to = next === "system" ? deviceNow() : next;
  if (to !== pageTheme() && !switchTheme(() => show(to), from)) return false;
  keep(next);
  return true;
}

function center(from: RevealFrom): { x: number; y: number } {
  if (from && "getBoundingClientRect" in from) {
    const r = from.getBoundingClientRect();
    if (r.width || r.height) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  } else if (from) return from;
  const rtl = document.documentElement.dir === "rtl";
  return { x: rtl ? 32 : innerWidth - 32, y: 32 };
}

const VARS = ["--theme-x", "--theme-y", "--theme-soft", "--theme-end"] as const;
type Transition = { finished: Promise<void>; skipTransition?: () => void };

/** Changes the theme by `apply`, which must set it at once. The new theme arrives out of `from` as a soft gradient,
    dissolves under reduced motion, or changes at once where the browser cannot. False when a change was already on
    screen and this one was let go. */
export function switchTheme(apply: () => void, from?: RevealFrom, reduced = reducesNow()): boolean {
  if (running) return false;
  const doc = document as Document & { startViewTransition?: (update: () => void) => Transition };
  if (typeof doc.startViewTransition !== "function" || document.visibilityState !== "visible") {
    apply();
    return true;
  }
  const root = document.documentElement;
  if (!reduced) {
    const at = center(from);
    const far = Math.hypot(Math.max(at.x, innerWidth - at.x), Math.max(at.y, innerHeight - at.y));
    /* the edge runs a third of the way to the farthest corner: wide enough that no line is seen crossing the page */
    const soft = Math.max(160, far / 3);
    root.style.setProperty("--theme-x", `${at.x}px`);
    root.style.setProperty("--theme-y", `${at.y}px`);
    root.style.setProperty("--theme-soft", `${soft}px`);
    root.style.setProperty("--theme-end", `${far + soft}px`);
  }
  running = true;
  setChanging(true);
  root.dataset.themeSwitch = reduced ? "dissolve" : "arrive";
  let guard: ReturnType<typeof setTimeout> | undefined;
  const done = () => {
    clearTimeout(guard);
    running = false;
    delete root.dataset.themeSwitch;
    for (const v of VARS) root.style.removeProperty(v);
    setChanging(false);
  };
  let transition: Transition;
  try {
    transition = doc.startViewTransition.call(doc, apply);
  } catch {
    done();
    apply();
    return true;
  }
  /* a browser that stalls lets the change go rather than leave the page frozen */
  guard = setTimeout(() => transition.skipTransition?.(), motion.reveal + 1600);
  transition.finished.then(done, done);
  return true;
}

/** The head's script that stamps the theme before the first paint, or a light reader sees a dark flash: the stored
    choice, else the device's scheme, and dark when neither can be read. */
export const themeScript = `(function(){var h=document.documentElement,t;try{t=localStorage.getItem(${JSON.stringify(KEY)})||localStorage.getItem(${JSON.stringify(OLD_KEY)})}catch(e){}try{if(t!=="light"&&t!=="dark")t=matchMedia(${JSON.stringify(LIGHT)}).matches?"light":"dark"}catch(e){t="dark"}h.dataset.theme=t})();`;
