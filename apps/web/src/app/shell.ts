import { type Binding, installKeys } from "@grabient/ui/keys.ts";
import { type Component, createContext, onSettled } from "solid-js";
import type { Drawn } from "../lib/palette.ts";

/* How a page and the frame around it meet. The frame (Shell.tsx) stays mounted while pages change under it: the water,
   the header with the wordmark's bar and its corner, the keys. A route says how it is framed in its staticData. Its
   loader may return `paint`, the palettes it opens on, which the bar and the water show from the first render on both
   sides. A page whose palettes change as the reader works (the editor, a figure, the selection) hands them in while it
   is mounted, over the loader's. */

/** How the frame stands around a page.
    - app: the lists and the editor. The header's surface and dashed rule, the bar in the palettes on screen.
    - brand: About, Settings and the pages beside them. No surface until the page scrolls, and the bar a window on
      the water.
    - sheet: a brand page that is one sheet on the water (sign-in, an app's consent, unsubscribe): the corner holds
      the theme alone, and without WebGL the light behind the sheet is the stronger one. */
export type Frame = "app" | "brand" | "sheet";

declare module "@tanstack/solid-router" {
  interface StaticDataRouteOption {
    frame?: Frame;
    /** under reduced motion the water stays, held still: a brand page whose sheet stands on it */
    still?: boolean;
    /** the water and the wordmark move even under reduced motion: sign-in */
    moving?: boolean;
    /** the tools the header's corner holds before the theme: a list's appearance, the editor's own */
    corner?: Component;
    /** the page's words are the site's own and translated, so each language's copy is indexed, unsearched */
    translated?: boolean;
    /** the page pins its stops along the foot of the screen (the editor): a note the frame floats stands over the
        artwork's top corner instead */
    strip?: boolean;
  }
}

/** What a route's loader returns for the frame, beside whatever else it returns. */
export interface FramedData {
  /** the palettes the page opens on, at most eight read: the bar cycles through them and the water carries them */
  paint?: readonly Drawn[];
}

export interface Shell {
  /** The palettes this page shows while the calling component is mounted, over its loader's: one is held and shown as
      it changes, several are cycled through. Null or none hands the bar back to the loader's, or to the water. */
  paint(palettes: () => readonly Drawn[] | null): void;
  /** The page's own keys while the calling component is mounted, listed by ? beside the shared ones. A binding with
      the id of a shared one (undo, copyUrl) stands in for it while it applies. */
  keys(bindings: () => readonly Binding[]): void;
}

/* Until the frame is drawn around the pages, a page that asks for it binds its own keys and its palettes go unshown. */
export const ShellContext = createContext<Shell>({
  paint() {},
  keys(bindings) {
    onSettled(() => installKeys(bindings));
  }
});
