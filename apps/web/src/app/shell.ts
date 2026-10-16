import type { Binding } from "@grabient/ui/keys.ts";
import type { StaticDataRouteOption } from "@tanstack/solid-router";
import { type Component, createContext } from "solid-js";
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
    /** the page pins its stops along the foot of the screen (the editor): a note the frame floats stands over the
        artwork's top corner instead */
    strip?: boolean;
  }
}

/** What a route's loader returns for the frame, beside whatever else it returns. */
export interface FramedData {
  /** the palettes the page opens on, at most eight read: the bar cycles through them and the water carries them */
  paint?: readonly Drawn[];
  /** the languages besides English a collection's page reads in, where its translation is of the English it has now:
      the language menu lets a crawler follow those */
  languages?: readonly string[];
}

/** The page on screen as the frame reads it from the router's matches: its route's options and the palettes its
    loader returned, or none where no page answered the address. */
export function pageFrom(
  matches: readonly {
    status: string;
    _notFound?: boolean;
    staticData: StaticDataRouteOption;
    loaderData?: unknown;
  }[]
) {
  const lost = matches.some(m => m.status === "notFound" || m._notFound);
  const leaf = lost ? undefined : matches[matches.length - 1];
  const data = leaf?.loaderData as FramedData | undefined;
  return {
    lost,
    options: leaf?.staticData ?? {},
    painted: data?.paint ?? [],
    languages: data?.languages
  };
}

export interface Shell {
  /** The palettes this page shows while the calling component is mounted, over its loader's: one is held and shown as
      it changes, several are cycled through. Null or none hands the bar back to the loader's, or to the water. */
  paint(palettes: () => readonly Drawn[] | null): void;
  /** The page's own keys while the calling component is mounted, listed by ? beside the shared ones. A binding with
      the id of a shared one (undo, copyUrl) stands in for it while it applies. */
  keys(bindings: () => readonly Binding[]): void;
  /** This page's address without its language, as the language menu offers it in every language. */
  here(): string;
  /** The languages besides English a collection's page reads in, which its loader read: the menu follows those. */
  languages(): readonly string[] | undefined;
}

/** Null where no frame stands: the root's own error page, which the frame's failure leaves alone in the document. */
export const ShellContext = createContext<Shell | null>(null);
