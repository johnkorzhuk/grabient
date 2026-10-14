import { decodePalette } from "@grabient/engine";
import { cssLine, paletteCss } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import { paletteSvg } from "@grabient/engine/svg.ts";
import {
  isSwatchFormat,
  SWATCH_FILES,
  swatchFile,
  swatchName,
  swatchPalette
} from "@grabient/engine/swatches.ts";
import { viewSearch } from "@grabient/engine/view.ts";
import { locale, msg, t } from "@grabient/i18n";
import { exportGridImage } from "@grabient/ui/exportgrid.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { colorFormat } from "../../lib/color-format.ts";
import { copyImage, downloadFile, writeText } from "../../lib/files.ts";
import type { Drawn } from "../../lib/palette.ts";
import { shownError } from "../account/session.ts";
import { type UseAt, type UsePlace, useTaken } from "../palette-use/use.ts";

/* What a card's strip hands over: the one palette as the card draws it, copied, saved as a file, or as the address of
   the file the site serves for it. Every function rejects with words the page can put on its line, in the reader's
   language. */

/** A card's picture as a file: two to one, as a share card is. */
const PICTURE = { width: 800, height: 400 };

const cannot = () => new Error(t("This palette can't be exported."));
const address = (p: Drawn) => `${location.origin}/${p.seed}${viewSearch(p)}`;
const name = (p: Drawn) => `grabient-${p.seed}`;
function stops(p: Drawn) {
  const palette = decodePalette(p.seed);
  if (!palette) throw cannot();
  return sampleStops(palette, Math.max(p.steps, palette.anchors.length));
}
function swatches(p: Drawn) {
  const palette = swatchPalette(p.seed, p, location.origin, undefined, { t, locale: locale() });
  if (!palette) throw cannot();
  return palette;
}
const svg = (p: Drawn) =>
  paletteSvg(
    stops(p).map(stop => stop.hex),
    p.style,
    p.angle,
    { seed: p.seed, search: viewSearch(p), baseUrl: location.origin },
    PICTURE
  );
const picture = (p: Drawn, kind: "png" | "jpeg") =>
  exportGridImage([p], { ...PICTURE, columns: 1, gap: 0, padding: 0, radius: 0 }, `image/${kind}`);

/** The address of the file the site serves for the palette in a format, drawn as the card draws it; its CSS in the
    spelling chosen in Settings, where that is not OKLCH. */
export function fileAddress(p: Drawn, format: Format): string {
  const query = new URLSearchParams(viewSearch(p).slice(1));
  if (format === "css" && colorFormat() !== "oklch") query.set("colors", colorFormat());
  const ending = isSwatchFormat(format) ? SWATCH_FILES[format].extension : format;
  return `${location.origin}/${p.seed}.${ending}${query.size ? `?${query}` : ""}`;
}

/** The palette onto the clipboard. A PNG saves instead where no picture can be copied. */
export async function copyPalette(p: Drawn, format: Format): Promise<"copied" | "downloaded"> {
  if (format === "png" || format === "jpeg") {
    const image = picture(p, format);
    if (format === "png" && (await copyImage(image))) return "copied";
    downloadFile(`${name(p)}.${format}`, await image);
    return "downloaded";
  }
  if (isSwatchFormat(format)) {
    const file = swatchFile(format, [swatches(p)]);
    if (typeof file !== "string") throw cannot();
    await writeText(file);
  } else if (format === "css") await writeText(cssLine(stops(p), p.style, p.angle, colorFormat()));
  else await writeText(format === "svg" ? svg(p) : address(p));
  return "copied";
}

/** The palette as a file. The Markdown is the site's own, saved as it serves it. */
export async function downloadPalette(p: Drawn, format: Format): Promise<void> {
  if (isSwatchFormat(format)) {
    const palette = swatches(p);
    return downloadFile(
      swatchName(palette.name, format),
      new Blob([swatchFile(format, [palette])], { type: SWATCH_FILES[format].type })
    );
  }
  if (format === "url") return writeText(address(p));
  if (format === "md") {
    const answer = await fetch(fileAddress(p, "md"));
    if (!answer.ok) throw new Error(t("Couldn't download the file."));
    return downloadFile(
      `${name(p)}.md`,
      new Blob([await answer.text()], { type: "text/markdown;charset=utf-8" })
    );
  }
  if (format === "css") {
    const drawn = stops(p);
    return downloadFile(
      `${name(p)}.css`,
      new Blob([paletteCss(drawn, p, address({ ...p, steps: drawn.length }), colorFormat())], {
        type: "text/css"
      })
    );
  }
  if (format === "svg")
    return downloadFile(`${name(p)}.svg`, new Blob([svg(p)], { type: "image/svg+xml" }));
  const kind = format === "jpeg" ? "jpeg" : "png";
  downloadFile(`${name(p)}.${kind}`, await picture(p, kind));
}

/** The address of the palette's file onto the clipboard. */
export const linkPalette = (p: Drawn, format: Format): Promise<void> =>
  writeText(fileAddress(p, format));

/** What a card's strip does: its palette as the card draws it copied, saved as a file or linked, each counted with the
    page and where the card stands. What could not be done is said on the page's line. */
export function cardTakings(card: {
  palette: () => Drawn;
  place: () => UsePlace;
  at: () => UseAt;
  say: (message: string, error?: boolean) => void;
}) {
  const used = (action: "copy" | "download", format: string) =>
    useTaken(action, format, card.place(), [card.palette()], card.at());
  const refused = (fallback: string) => (reason: unknown) => {
    card.say(shownError(reason, fallback), true);
    return false;
  };
  return {
    copy: (format: Format) =>
      copyPalette(card.palette(), format).then(
        done => {
          if (done === "downloaded")
            card.say(t("Images can't be copied here, so the file was downloaded."));
          used(done === "downloaded" ? "download" : "copy", format);
          return done === "copied";
        },
        refused(msg("Couldn't copy the palette."))
      ),
    download: (format: Format) =>
      void downloadPalette(card.palette(), format).then(
        () => used(format === "url" ? "copy" : "download", format),
        refused(msg("Couldn't download the palette."))
      ),
    link: (format: Format) =>
      linkPalette(card.palette(), format).then(
        () => {
          used("copy", `link:${format}`);
          return true;
        },
        refused(msg("Couldn't copy the palette."))
      )
  };
}
