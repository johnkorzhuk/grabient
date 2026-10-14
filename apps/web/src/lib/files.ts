import { decodePalette } from "@grabient/engine";
import { paletteCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import type { Namer } from "@grabient/engine/precise-names.ts";
import {
  isSwatchFormat,
  SWATCH_FILES,
  type SwatchFormat,
  type SwatchPalette,
  swatchFile,
  swatchName,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import { type Size, type View, viewSearch } from "@grabient/engine/view.ts";
import { locale, t } from "@grabient/i18n";
import { copyText, downloadFile } from "@grabient/ui/copy.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { colorFormat } from "./color-format.ts";
import { namesNow, namesWithin } from "./color-names.ts";

/* The app's side of taking things away: text and pictures onto the clipboard, each refusal said, and a palette's own
   files, the same from a card and from the editor. Browser only. */

type Shown = View & { seed: string };
const cannot = () => new Error(t("This palette can't be exported."));

/** A palette as a swatch file holds it: its colors by their precise names where `names` holds them, else by the broad
    names in the reader's language. */
export function swatchesOf(p: Shown, names?: Namer | null): SwatchPalette {
  const palette = swatchPalette(p.seed, p, location.origin, {
    language: { t, locale: locale() },
    names
  });
  if (!palette) throw cannot();
  return palette;
}

/** A swatch file onto the clipboard, written once its colors' names are read: the copy is asked for while the press
    still counts, as a browser wants, and filled when they arrive. A file that is no text can't be copied. */
export async function copySwatches(
  file: (names: Namer | null) => ReturnType<typeof swatchFile>
): Promise<void> {
  const text = (names: Namer | null) => {
    const made = file(names);
    if (typeof made !== "string") throw cannot();
    return made;
  };
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    const blob = namesWithin().then(names => new Blob([text(names)], { type: "text/plain" }));
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      return;
    } catch {
      // refused: the copy command's way below
    }
  }
  return writeText(text(namesNow()));
}

/** A palette's file as the site serves it, saved: its Markdown, its CSS or a swatch file. */
export async function saveFile(p: Shown, format: "md" | "css" | SwatchFormat): Promise<void> {
  const name = `grabient-${p.seed}`;
  if (format === "md") {
    const answer = await fetch(fileAddress(p, "md"));
    if (!answer.ok) throw new Error(t("Couldn't download the file."));
    const text = await answer.text();
    return downloadFile(`${name}.md`, new Blob([text], { type: "text/markdown;charset=utf-8" }));
  }
  if (format === "css") {
    const palette = decodePalette(p.seed);
    if (!palette) throw cannot();
    const stops = sampleStops(palette, Math.max(p.steps, palette.anchors.length));
    const page = `${location.origin}/${p.seed}${viewSearch({ ...p, steps: stops.length })}`;
    const css = paletteCss(stops, p, page, colorFormat());
    return downloadFile(`${name}.css`, new Blob([css], { type: "text/css;charset=utf-8" }));
  }
  const palette = swatchesOf(p, await namesWithin());
  downloadFile(
    swatchName(palette.name, format),
    new Blob([swatchFile(format, [palette])], { type: SWATCH_FILES[format].type })
  );
}

/** The address of the file the site serves for a palette in a format, drawn in its view: a picture at `pixels` where a
    size is set (the Worker's w and h), CSS in the spelling chosen in Settings where that is not OKLCH. */
export function fileAddress(p: View & { seed: string }, format: Format, pixels?: Size): string {
  const query = new URLSearchParams(viewSearch(p).slice(1));
  if (pixels && (format === "png" || format === "svg")) {
    query.set("w", String(pixels.width));
    query.set("h", String(pixels.height));
  }
  if (format === "css" && colorFormat() !== "oklch") query.set("colors", colorFormat());
  const ending = isSwatchFormat(format) ? SWATCH_FILES[format].extension : format;
  return `${location.origin}/${p.seed}.${ending}${query.size ? `?${query}` : ""}`;
}

/** Text onto the clipboard, by the copy command where the browser refuses the clipboard (another site's frame without
    clipboard-write); rejects, in the reader's language, when neither takes it. */
export async function writeText(text: string): Promise<void> {
  if (!(await copyText(text))) throw new Error(t("Couldn't copy."));
}

/** A picture onto the clipboard. False where none can go there (no image clipboard, or another site's frame without
    clipboard-write), for the caller to save it instead; a picture that could not be drawn still rejects. */
export async function copyImage(image: Promise<Blob>): Promise<boolean> {
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": image })]);
    return true;
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "NotAllowedError") return false;
    throw error;
  }
}
