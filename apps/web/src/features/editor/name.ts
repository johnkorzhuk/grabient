import { asSaved } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import { heading } from "../../lib/page-meta.ts";
import type { PaletteEditor } from "./editor.ts";
import type { PaletteData } from "./page.ts";

/** The palette's name as its page shows it: its written title while it is drawn as it was saved, in every language,
    as its words were written; else the server's words while the palette and its view are the page's own, else the name
    its colors and view give it. The page's metadata keeps to the reader's language (lib/page-meta.ts). The sheet's name
    row reads it, and on a phone the picture's caption. */
export function paletteName(
  e: PaletteEditor,
  serverHeading: string | undefined,
  facts: PaletteData["facts"]
): string {
  const view = { style: e.style(), steps: e.steps(), angle: e.angle() };
  const written = facts?.written;
  if (written && asSaved(e.palette(), view, written.view)) return written.title;
  return (
    serverHeading ||
    heading({
      kind: "palette",
      seed: e.seed(),
      palette: e.palette(),
      view,
      ...(written ? { written } : {})
    }) ||
    t("Palette editor")
  );
}
