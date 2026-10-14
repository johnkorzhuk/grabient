import { t } from "@grabient/i18n";
import { heading } from "../../lib/page-meta.ts";
import type { PaletteEditor } from "./editor.ts";
import type { PaletteData } from "./page.ts";

/** The palette's name as its page shows it: the server's words while the palette and its view are the page's own,
    else the name its colors and view give it. The sheet's name row reads it, and on a phone the picture's caption. */
export function paletteName(
  e: PaletteEditor,
  serverHeading: string | undefined,
  facts: PaletteData["facts"]
): string {
  return (
    serverHeading ||
    heading({
      kind: "palette",
      seed: e.seed(),
      palette: e.palette(),
      view: { style: e.style(), steps: e.steps(), angle: e.angle() },
      ...(facts?.written ? { written: facts.written } : {})
    }) ||
    t("Palette editor")
  );
}
