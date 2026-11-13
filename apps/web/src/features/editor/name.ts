import { effectView } from "@grabient/engine/effect.ts";
import { t } from "@grabient/i18n";
import { paletteName as colorsName, heading } from "../../lib/page-meta.ts";
import type { PaletteEditor } from "./editor.ts";
import type { PaletteData } from "./page.ts";

/** The palette's name as its page shows it: its written title, in whatever view or effect it is drawn and in every
    language, as its words were written; else the server's words while the palette, its view and its effect are the
    page's own, else the name its colors give it with its view's style or the effect it plays. The page's metadata
    keeps to the reader's language (lib/page-meta.ts). The sheet's name row reads it, and on a phone the picture's
    caption. */
export function paletteName(
  e: PaletteEditor,
  serverHeading: string | undefined,
  facts: PaletteData["facts"]
): string {
  const view = { style: e.style(), steps: e.steps(), angle: e.angle() };
  const written = facts?.written;
  const effect = e.effect();
  if (written) return written.title;
  return (
    serverHeading ||
    heading({
      kind: "palette",
      seed: e.seed(),
      palette: e.palette(),
      view,
      ...(effect ? { effect } : {}),
      ...(written ? { written } : {})
    }) ||
    t("Palette editor")
  );
}

/** The palette's name for an effect's copy, which Figma's frame takes: what its colors are called as the effect's page
    reads them, with no style's words, since the effect draws no gradient. */
export function effectName(e: PaletteEditor): string {
  return colorsName(e.palette(), effectView(e.palette())) || t("Palette editor");
}
