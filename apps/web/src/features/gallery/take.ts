import { decodePalette } from "@grabient/engine";
import { cssLine } from "@grabient/engine/css.ts";
import { sampleStops } from "@grabient/engine/curve.ts";
import type { Effect } from "@grabient/engine/effect.ts";
import { paletteSvg } from "@grabient/engine/svg.ts";
import { isSwatchFormat, swatchFile } from "@grabient/engine/swatches.ts";
import { DEFAULT_SIZE, resolveSize, type SizeChoice, viewSearch } from "@grabient/engine/view.ts";
import { msg, t } from "@grabient/i18n";
import { downloadFile } from "@grabient/ui/copy.ts";
import { exportGridImage } from "@grabient/ui/exportgrid.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { colorFormat } from "../../lib/color-format.ts";
import {
  copyImage,
  copySwatches,
  fileAddress,
  saveFile,
  swatchesOf,
  writeText
} from "../../lib/files.ts";
import type { Drawn } from "../../lib/palette.ts";
import { shownError } from "../../lib/query.ts";
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
const svg = (p: Drawn) =>
  paletteSvg(
    stops(p).map(stop => stop.hex),
    p.style,
    p.angle,
    { seed: p.seed, search: viewSearch(p), baseUrl: location.origin },
    PICTURE
  );
const picture = (p: Drawn) =>
  exportGridImage([p], { ...PICTURE, columns: 1, gap: 0, padding: 0, radius: 0 }, "image/png");

/** The palette onto the clipboard. Its PNG saves instead where no picture can be copied. */
export async function copyPalette(p: Drawn, format: Format): Promise<"copied" | "downloaded"> {
  if (format === "png") {
    const image = picture(p);
    if (await copyImage(image)) return "copied";
    downloadFile(`${name(p)}.png`, await image);
    return "downloaded";
  }
  if (isSwatchFormat(format))
    await copySwatches(names => swatchFile(format, [swatchesOf(p, names)]));
  else if (format === "css") await writeText(cssLine(stops(p), p.style, p.angle, colorFormat()));
  else await writeText(format === "svg" ? svg(p) : address(p));
  return "copied";
}

/** The palette as a file, in a format a card's strip saves: its Markdown, CSS, SVG, PNG or a swatch file. */
export async function downloadPalette(p: Drawn, format: Format): Promise<void> {
  if (format === "md" || format === "css" || isSwatchFormat(format)) return saveFile(p, format);
  if (format === "svg")
    return downloadFile(`${name(p)}.svg`, new Blob([svg(p)], { type: "image/svg+xml" }));
  downloadFile(`${name(p)}.png`, await picture(p));
}

/** The address of the palette's file onto the clipboard. */
export const linkPalette = (p: Drawn, format: Format): Promise<void> =>
  writeText(fileAddress(p, format));

/* A card playing its list's effect hands the effect over as the editor's strips do, at the size the list sets (its
   code loads with the first press), and offers what they offer (editor/formats.ts STRIP_*): Copy adds the tags that
   play it and its Figma layers, Copy link its script. The formats are a copy of the editor's, which take.test.ts holds
   alike: shared, they cost a list's start more than the copy does. */
const formats = () => import("../editor/formats.ts");
const playedTaken = (p: Drawn, effect: Effect, size: SizeChoice | null, name?: string) => ({
  ...p,
  size,
  pixels: resolveSize(size, DEFAULT_SIZE),
  stops: stops(p),
  effect,
  name
});
const COPY: readonly Format[] = ["url", "css", "svg", "png"];
const FILES: readonly Format[] = ["md", "css", "svg", "png"];
const CHIPS = { copy: COPY, download: FILES, link: FILES };
const EFFECT_CHIPS: typeof CHIPS = {
  copy: [...COPY, "html", "figma"],
  download: FILES,
  link: [...FILES, "js"]
};

/** What a card's strip does: its palette as the card draws it copied, saved as a file or linked, each counted with the
    page and where the card stands, or the effect it plays as the editor's strips hand one over. What could not be done
    is said on the page's line. */
export function cardTakings(card: {
  palette: () => Drawn;
  /** the effect the card plays, in its palette's own shape, and the size its list sets */
  played?: () => { effect: Effect; size: SizeChoice | null } | null;
  /** what the card calls the palette, which a copy for Figma names its frame */
  name?: () => string;
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
  const played = () => card.played?.() ?? null;
  const taken = (fx: { effect: Effect; size: SizeChoice | null }) =>
    playedTaken(card.palette(), fx.effect, fx.size, card.name?.());
  return {
    /** the formats the card's strip offers in each mode */
    chips: () => (played() ? EFFECT_CHIPS : CHIPS),
    copy: (format: Format) => {
      const fx = played();
      return (
        fx
          ? formats().then(m => m.copyOrSave(format, taken(fx)))
          : copyPalette(card.palette(), format)
      ).then(
        done => {
          if (done === "downloaded")
            card.say(t("Images can't be copied here, so the file was downloaded."));
          used(done === "downloaded" ? "download" : "copy", format);
          return done === "copied";
        },
        refused(msg("Couldn't copy the palette."))
      );
    },
    download: (format: Format) => {
      const fx = played();
      void (
        fx
          ? formats().then(m => m.saveFormat(format, taken(fx)))
          : downloadPalette(card.palette(), format)
      ).then(() => used("download", format), refused(msg("Couldn't download the palette.")));
    },
    link: (format: Format) => {
      const fx = played();
      return (
        fx
          ? formats().then(m => m.copyLink(format, taken(fx)))
          : linkPalette(card.palette(), format)
      ).then(
        () => {
          used("copy", `link:${format}`);
          return true;
        },
        refused(msg("Couldn't copy the palette."))
      );
    }
  };
}
