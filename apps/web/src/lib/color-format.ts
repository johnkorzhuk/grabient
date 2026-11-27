import { type ColorKind, colorKind } from "@grabient/engine/css.ts";
import { isServer } from "@solidjs/web";
import { createSignal } from "solid-js";

/* The spelling of the colors a reader takes as CSS: OKLCH, hex, rgb() or hsl(). The reader chooses in Settings, per
   browser (`grabient-colors`), and the choice reaches every CSS a strip copies, downloads and links, the selection's
   CSS and the editor's code. No choice writes CSS in OKLCH and a color's one code (a color page's byline) in hex; a
   choice of OKLCH is kept by its name, so the byline tells it from none. The signals start unchosen on both sides,
   so a page hydrates as the server drew it, and syncColorFormat() reads the browser's own once the page is live. */
const KEY = "grabient-colors";
const [format, setFormat] = createSignal<ColorKind>("oklch");
const [chosen, setChosen] = createSignal<ColorKind | null>(null);

/** The spelling CSS is written in, in this browser. */
export const colorFormat = format;
/** The spelling a color's one code is shown in: the reader's choice, hex until there is one. */
export const codeFormat = (): ColorKind => chosen() ?? "hex";

const read = (): ColorKind | null => {
  try {
    const kept = localStorage.getItem(KEY);
    return kept === null ? null : colorKind(kept);
  } catch {
    return null;
  }
};
let synced = false;
/** Reads this browser's choice once the page is live, and follows a choice made in another tab from then on. */
export function syncColorFormat(): void {
  if (isServer || synced) return;
  synced = true;
  const take = () => {
    const kept = read();
    setChosen(kept);
    setFormat(kept ?? "oklch");
  };
  take();
  window.addEventListener("storage", e => {
    if (e.key === KEY || e.key === null) take();
  });
}
/** The reader's choice for this browser, kept. */
export function setColorFormat(next: ColorKind): void {
  setFormat(next);
  setChosen(next);
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* a browser that keeps no site data: the choice lasts as long as the page */
  }
}
