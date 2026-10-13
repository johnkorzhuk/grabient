/* The sizes a picture is made at, shared by the size control over the editor's artwork and the export column: the size
   the reader set (either side may be Auto), the presets in one list for both, and the reader's own screen. The size
   arithmetic is the engine's (view.ts). */

import {
  isFixedSize,
  resolveSize,
  SIZE_MAX,
  SIZE_MIN,
  type Size,
  type SizeChoice
} from "@grabient/engine/view.ts";
import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";
import { msg, t } from "./i18n.ts";
import type { MenuItem } from "./Menu.tsx";

export { isFixedSize, resolveSize, SIZE_MAX, SIZE_MIN, type Size, type SizeChoice };

/** A size with its pixels; a foldable's screen says which it is. */
export interface SizePreset extends MenuItem {
  w: number;
  h: number;
  part?: "inner" | "cover";
}
/** A maker, its devices the choices its row opens. */
export interface SizeMaker extends MenuItem {
  items: readonly SizePreset[];
}
/** A row a list of sizes draws. */
export type SizeRow = MenuItem & { w?: number; h?: number };

/** Both sides auto is no size at all. */
export const normalizeSize = (c: SizeChoice | null | undefined): SizeChoice | null =>
  !c || (c.width === "auto" && c.height === "auto") ? null : c;

/** Width or Height as typed: a number, the word Auto in English or the reader's language (a step under the floor,
    where the field reads Auto), or a number with its thousands marked, 1,920 or 1.920, which no side is small enough
    to mean otherwise. */
export function parseSide(text: string): number {
  const s = text.trim();
  if (/^auto$/i.test(s) || s.toLowerCase() === t("Auto").toLowerCase()) return SIZE_MIN - 1;
  return /^\d{1,3}([.,]\d{3})+$/.test(s)
    ? Number.parseFloat(s.replace(/[.,]/g, ""))
    : Number.parseFloat(s);
}

const preset = (value: string, label: string, w: number, h: number, group = false): SizePreset => ({
  value,
  label,
  detail: `${w}×${h}`,
  w,
  h,
  ...(group ? { group } : {})
});
const maker = (value: string, label: string, items: SizePreset[]): SizeMaker => ({
  value,
  label,
  more: true,
  items
});
/* a foldable's two screens, a row each */
const fold = (
  value: string,
  label: string,
  inner: [number, number],
  cover: [number, number],
  group = false
): SizePreset[] => [
  { ...preset(`${value}-inner`, label, ...inner, group), part: "inner" },
  { ...preset(`${value}-cover`, label, ...cover), part: "cover" }
];

/** A size's name in the reader's language: a word is translated, a device keeps its own name, and a foldable's screen
    says which it is. */
export function sizeLabel(p: MenuItem & { part?: "inner" | "cover" }): string {
  if (p.part === "inner") return t("{device} inner", { device: p.label });
  if (p.part === "cover") return t("{device} cover", { device: p.label });
  return t(p.label);
}

/* The screens most readers use (grabient.com's analytics beside the year's sales), at the top with the posts; a device
   is one press further, under its maker. */
const SCREENS: readonly SizePreset[] = [
  preset("1080p", "1080p", 1920, 1080, true),
  preset("1440p", "1440p", 2560, 1440),
  preset("4k", "4K", 3840, 2160),
  preset("ultrawide", msg("Ultrawide"), 3440, 1440)
];
const POSTS: readonly SizePreset[] = [
  preset("square", msg("Square"), 1080, 1080, true),
  preset("story", msg("Story"), 1080, 1920)
];
/** The makers' devices most in use and the best sellers of the last year, at their panels' own pixels, a phone
    standing up and a computer lying down; models that share a screen share a row, newest first. Sources: TelemetryDeck,
    AppBrain, Counterpoint's top ten, grabient.com's analytics by screen, each maker's spec pages. Review each September. */
export const SIZE_MAKERS: readonly SizeMaker[] = [
  maker("apple", "Apple", [
    preset("iphone-max", "iPhone 16–18 Pro Max", 1320, 2868),
    preset("iphone", "iPhone 17, 16–18 Pro", 1206, 2622),
    preset("iphone-16", "iPhone 15, 16, 14–15 Pro", 1179, 2556),
    preset("iphone-15-pro-max", "iPhone 14–15 Pro Max", 1290, 2796),
    preset("iphone-13", "iPhone 12–14, 16e, 17e", 1170, 2532),
    preset("iphone-11", "iPhone 11, XR", 828, 1792),
    ...fold("iphone-duo", "iPhone Duo", [1878, 2670], [1398, 2034], true),
    preset("ipad", "iPad, iPad Air 11″", 1640, 2360, true),
    preset("ipad-10-2", "iPad 10.2″", 1620, 2160),
    preset("ipad-air-13", "iPad Air 13″, Pro 12.9″", 2048, 2732),
    preset("macbook", "MacBook Air 13″", 2560, 1664, true),
    preset("macbook-m1", "MacBook Air M1, Pro 13″", 2560, 1600),
    preset("macbook-air-15", "MacBook Air 15″", 2880, 1864),
    preset("macbook-pro-14", "MacBook Pro 14″", 3024, 1964),
    preset("macbook-pro-16", "MacBook Pro 16″", 3456, 2234),
    preset("imac", "iMac 24″", 4480, 2520),
    preset("studio-display", "iMac 27″, Studio Display", 5120, 2880)
  ]),
  maker("samsung", "Samsung", [
    preset("galaxy", "Galaxy S24–S26 Ultra", 1440, 3120),
    preset("galaxy-s23-ultra", "Galaxy S22–S23 Ultra", 1440, 3088),
    preset("galaxy-s26", "Galaxy S23–S26", 1080, 2340),
    preset("galaxy-a", "Galaxy A15–A17, A54–A57", 1080, 2340),
    preset("galaxy-a13", "Galaxy A13, A14", 1080, 2408),
    preset("galaxy-a52", "Galaxy A05s, A32, A51–A53", 1080, 2400),
    preset("galaxy-a12", "Galaxy A05–A07, A12", 720, 1600)
  ]),
  maker("google", "Google", [
    preset("pixel-11-pro-xl", "Pixel 9–11 Pro XL", 1344, 2992),
    preset("pixel-11-pro", "Pixel 9–11 Pro", 1280, 2856),
    preset("pixel-11", "Pixel 9–11, 9a, 10a", 1080, 2424),
    preset("pixel-8", "Pixel 7, 8, 7a, 8a", 1080, 2400)
  ]),
  maker("xiaomi", "Xiaomi", [
    preset("redmi-note-17", "Redmi Note 17", 1080, 2396),
    preset("redmi-note", "Redmi Note 11–14", 1080, 2400),
    preset("redmi-12", "Redmi 12", 1080, 2460),
    preset("redmi-a5", "Redmi A5, 14C", 720, 1640),
    preset("redmi-13c", "Redmi 13C, 15C", 720, 1600)
  ]),
  maker("oppo", "OPPO", [
    preset("oppo-a3x", "OPPO A3x, A80", 720, 1604),
    preset("oppo-a18", "OPPO A17, A18, A38", 720, 1612)
  ]),
  maker("vivo", "vivo", [
    preset("vivo-y19s", "vivo Y19s, Y19s Pro", 720, 1608),
    preset("vivo-y28s", "vivo Y17s, Y18, Y28s", 720, 1612),
    preset("vivo-y16", "vivo Y16", 720, 1600)
  ])
];

/** Every size with pixels, the makers' devices among them. */
export const SIZE_PRESETS: readonly SizePreset[] = [
  ...SCREENS,
  ...SIZE_MAKERS.flatMap(m => m.items),
  ...POSTS
];

/** The rows a list of sizes draws: Auto with what it is, the reader's screen where it is known, the screens, the makers
    (each opening its devices), the posts. Labels still to be said with sizeLabel. */
export function sizeRows(auto: Size, screen: Size | null): SizeRow[] {
  return [
    { value: "auto", label: msg("Auto"), detail: `${auto.width}×${auto.height}` },
    ...(screen
      ? [
          {
            value: "screen",
            label: msg("This screen"),
            detail: `${screen.width}×${screen.height}`,
            w: screen.width,
            h: screen.height
          }
        ]
      : []),
    ...SCREENS,
    ...SIZE_MAKERS.map((m, i) => (i ? m : { ...m, group: true })),
    ...POSTS
  ];
}

/** The preset a size is: auto for no size, a preset's value, `screen` for the reader's own screen, or custom. A size
    with an auto side is custom, since no preset has one. */
export function sizePresetOf(choice: SizeChoice | null | undefined, screen?: Size | null): string {
  const c = normalizeSize(choice);
  if (!c) return "auto";
  if (!isFixedSize(c)) return "custom";
  return (
    SIZE_PRESETS.find(p => p.w === c.width && p.h === c.height)?.value ??
    (screen && screen.width === c.width && screen.height === c.height ? "screen" : "custom")
  );
}

/* The row pressed last, in either control: many phones share a screen, so of the rows with a size's pixels the lists
   light the one pressed, after a reload too. Kept by this browser alone and read once the page is live, so the server
   and the first render agree. */
const PRESSED = "grabient-size-pressed";
const [pressed, setPressed] = createSignal<string | null>(null);
let loaded = false;
/** The row pressed last, once loadPressedSize has read it. */
export const pressedSize = pressed;
/** Reads the row this browser pressed last; the controls call it when they have settled. */
export function loadPressedSize(): void {
  if (loaded || isServer) return;
  loaded = true;
  try {
    setPressed(localStorage.getItem(PRESSED));
  } catch {
    /* no site data: none pressed */
  }
}
export function pressSize(value: string): void {
  setPressed(value);
  try {
    localStorage.setItem(PRESSED, value);
  } catch {
    /* kept for this page only */
  }
}

/** What the browser says of the screen it is on. */
export interface ScreenReading {
  /** screen.width and screen.height, in the system's points */
  width: number;
  height: number;
  devicePixelRatio: number;
  outerWidth: number;
  innerWidth: number;
  outerHeight: number;
  innerHeight: number;
  /** a Chromium browser: its devicePixelRatio carries the page's zoom and its `screen` does not */
  chromium: boolean;
}
/* Chromium's zoom levels; a computer's own scale steps by a quarter */
const ZOOMS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const quarterStep = (s: number) => s > 0.99 && Math.abs(s * 4 - Math.round(s * 4)) < 0.02;
/* The system's scale with a Chromium page's zoom taken out. The zoom shows as the window's outer size over its inner
   one: at most the smaller ratio (the frame and toolbars only take inner room), at least the width's less a border.
   Among Chromium's levels in those bounds, the one that leaves a quarter step is the zoom. Firefox scales `screen` with
   the zoom and Safari leaves both alone, so there the ratio is already the system's. */
function systemScale(r: ScreenReading): number {
  const dpr = r.devicePixelRatio;
  if (
    !r.chromium ||
    !(r.innerWidth > 0 && r.innerHeight > 0 && r.outerWidth > 0 && r.outerHeight > 0)
  )
    return dpr;
  const most = Math.min(r.outerWidth / r.innerWidth, r.outerHeight / r.innerHeight) * 1.01;
  const least = ((r.outerWidth - 24) / r.innerWidth) * 0.99;
  const zoom = ZOOMS.find(z => z >= least && z <= most && quarterStep(dpr / z));
  return zoom ? dpr / zoom : dpr;
}
/* One side's pixels. A whole scale multiplies exactly; a fractional one leaves the points rounded (up in Chromium, to
   the nearest elsewhere), so the panel's side lies within a point below and half a point above the product, and among
   those it is the one with the most factors of two: 411.43 points at 2.625 are a phone's 1080. */
function sidePixels(points: number, scale: number): number {
  const exact = points * scale;
  if (Math.abs(scale - Math.round(scale)) < 1e-9) return Math.round(exact);
  let best = Math.round(exact);
  let rank = -1;
  for (let p = Math.floor((points - 1) * scale) + 1; p < (points + 0.5) * scale; p++) {
    const twos = Math.log2(p & -p);
    if (twos > rank || (twos === rank && Math.abs(p - exact) < Math.abs(best - exact))) {
      best = p;
      rank = twos;
    }
  }
  return best;
}
/** The screen's own pixels. A phone's stands up whichever way it is held, as its wallpaper does; past the export's
    ceiling the shape is kept. */
export function screenPixels(r: ScreenReading): Size | null {
  if (!(r.width > 0 && r.height > 0 && r.devicePixelRatio > 0)) return null;
  const phone = Math.min(r.width, r.height) < 600;
  const scale = phone ? r.devicePixelRatio : systemScale(r);
  let w = sidePixels(r.width, scale);
  let h = sidePixels(r.height, scale);
  if (phone && w > h) [w, h] = [h, w];
  const k = Math.min(1, SIZE_MAX / Math.max(w, h));
  return {
    width: Math.max(SIZE_MIN, Math.round(w * k)),
    height: Math.max(SIZE_MIN, Math.round(h * k))
  };
}
/** The screen this window is on, read now; null on the server. */
export function screenSize(): Size | null {
  if (isServer || !window.screen) return null;
  return screenPixels({
    width: screen.width,
    height: screen.height,
    devicePixelRatio: window.devicePixelRatio || 1,
    outerWidth: window.outerWidth,
    innerWidth: window.innerWidth,
    outerHeight: window.outerHeight,
    innerHeight: window.innerHeight,
    chromium: "userAgentData" in navigator
  });
}
