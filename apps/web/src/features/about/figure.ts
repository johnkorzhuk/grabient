import { canonical, encodePalette } from "@grabient/engine/codec.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { DEFAULT_ANGLE, DEFAULT_STYLE } from "@grabient/engine/view.ts";
import { NO_LOCKS } from "../editor/address.ts";
import { createPaletteEditor } from "../editor/editor.ts";
import { clampSteps } from "../editor/ops.ts";

/* A palette of About's own, never the address's: the editor's state over it, so a figure is the editor's side by the
   editor's rules, with an undo of its own that lasts while the page is open. Steps are how the palette is drawn, never
   an undo step. */
export function createFigure(first: Palette, firstSteps = 7) {
  const palette = canonical(first);
  const seed = encodePalette(palette);
  const steps = (K: number) => clampSteps(firstSteps, K);
  const e = createPaletteEditor(
    {
      seed,
      palette,
      view: { style: DEFAULT_STYLE, steps: steps(palette.anchors.length), angle: DEFAULT_ANGLE },
      locks: NO_LOCKS,
      selection: false
    },
    undefined,
    true
  );
  return {
    ...e,
    selection: e.held,
    shown: e.shownPalette,
    anchorStops: e.shownKeyframes,
    /** the reader has changed the figure: its Reset has something to put back */
    dirty: () => e.seed() !== seed || e.steps() !== steps(e.K()),
    /** the palette the page opened with, as one step the undo can take back */
    reset() {
      e.letGo();
      e.set(palette);
      e.setSteps(firstSteps);
    }
  };
}
export type Figure = ReturnType<typeof createFigure>;
