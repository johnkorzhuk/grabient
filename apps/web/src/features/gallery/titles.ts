import { decodePalette } from "@grabient/engine";
import { DEFAULT_STEPS, DEFAULT_STYLE } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import type { GalleryPlace } from "./address.ts";
import { nameOf } from "./drawing.ts";

/* What a gallery page is called: the heading a reader who listens hears first, which no line on screen repeats (the
   field holds the words), and the document's title. */

/** The palette a search names in place of words, by its name; null for words. */
export function searchedName(words: string): string | null {
  const palette = words.startsWith("k") ? decodePalette(words) : null;
  return palette
    ? nameOf({
        seed: words,
        style: DEFAULT_STYLE,
        steps: Math.max(DEFAULT_STEPS, palette.anchors.length),
        angle: 90
      })
    : null;
}

export function heading(place: GalleryPlace): string {
  const words = place.params.words;
  const name = words ? searchedName(words) : null;
  if (place.kind === "home") {
    if (!words) return t("Hot palettes and collections");
    return name
      ? t("Palettes like {name}", { name })
      : t("{subject} palettes and collections", { subject: words });
  }
  if (place.kind === "saved") {
    if (!words) return t("Saved palettes");
    return name
      ? t("Saved palettes like {name}", { name })
      : t("Saved palettes for {query}", { query: words });
  }
  if (words) {
    return name
      ? t("Palettes like {name}", { name })
      : t("{subject} gradients and color palettes", { subject: words });
  }
  return place.order === "rising" ? t("Rising gradient palettes") : t("Popular gradient palettes");
}

/** The document's title: the home's own at rest, else its heading, with its page past the first and the site after. */
export function title(place: GalleryPlace): string {
  if (place.kind === "home" && !place.params.words && place.params.page === 1) {
    return t("Grabient — CSS Gradient Generator & Color Palettes");
  }
  const named =
    place.params.page > 1
      ? t("{title}, page {page}", { title: heading(place), page: String(place.params.page) })
      : heading(place);
  return `${named} | Grabient`;
}
