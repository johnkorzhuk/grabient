import { type ColorKind, colorKind } from "@grabient/engine/css.ts";
import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";

/* The spelling of the colors a reader takes as CSS: OKLCH, hex, rgb() or hsl(). The reader chooses in Settings, per
   browser (`grabient-colors`), and the choice reaches every CSS a strip copies, downloads and links, the selection's
   CSS and the editor's code. OKLCH, the default, is kept as no value. The signal starts at OKLCH on both sides, so a
   page hydrates as the server drew it, and syncColorFormat() reads the browser's own once the page is live. */
const KEY = "grabient-colors";
const [format, setFormat] = createSignal<ColorKind>("oklch");

/** The spelling CSS is written in, in this browser. */
export const colorFormat = format;

const read = (): ColorKind => {
  try {
    return colorKind(localStorage.getItem(KEY));
  } catch {
    return "oklch";
  }
};
let synced = false;
/** Reads this browser's choice once the page is live, and follows a choice made in another tab from then on. */
export function syncColorFormat(): void {
  if (isServer || synced) return;
  synced = true;
  setFormat(read());
  window.addEventListener("storage", e => {
    if (e.key === KEY || e.key === null) setFormat(read());
  });
}
/** The reader's choice for this browser, kept. */
export function setColorFormat(next: ColorKind): void {
  setFormat(next);
  try {
    if (next === "oklch") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* a browser that keeps no site data: the choice lasts as long as the page */
  }
}
