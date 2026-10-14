import { isSwatchFormat, SWATCH_FILES } from "@grabient/engine/swatches.ts";
import { type Size, type View, viewSearch } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import { copyText } from "@grabient/ui/copy.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { colorFormat } from "./color-format.ts";

/* The app's side of taking things away: text and pictures onto the clipboard, each refusal said, and the address of a
   palette's file. Browser only. */

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
