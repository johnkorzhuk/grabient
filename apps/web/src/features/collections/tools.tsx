import { decodePalette } from "@grabient/engine";
import { sampleStops } from "@grabient/engine/curve.ts";
import { DEFAULT_SIZE } from "@grabient/engine/view.ts";
import { t } from "@grabient/i18n";
import { type Format, FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import type { Drawn } from "../../lib/palette.ts";
import type { Taken } from "../editor/formats.ts";
import { type UseAt, type UsePlace, useTaken } from "../palette-use/use.ts";

const FILES: readonly Format[] = ["md", "css", "svg", "png"];
/* what takes a palette is the editor's, loaded with the first strip a card mounts: no list waits on it, and it is
   there before any press */
type Takers = typeof import("../editor/formats.ts");
let loaded: Takers | undefined;
const takers = async (): Promise<Takers> => (loaded ??= await import("../editor/formats.ts"));

/** A card's copies, downloads and links: the palette as the card draws it, taken as the editor's strip takes one and
    counted with the page it was on and where its card stood. What could not be done is said on the page's line. */
export function cardTools(card: {
  palette: () => Drawn;
  place: () => UsePlace;
  at: () => UseAt;
  note: (message: string, error?: boolean) => void;
}) {
  const taken = (): Taken => {
    const p = card.palette();
    const palette = decodePalette(p.seed);
    if (!palette) throw new Error();
    return { ...p, size: null, pixels: DEFAULT_SIZE, stops: sampleStops(palette, p.steps) };
  };
  const used = (action: "copy" | "download", format: string) =>
    useTaken(action, format, card.place(), [card.palette()], card.at());
  const download = async (format: Format) => {
    try {
      await (await takers()).saveFormat(format, taken());
      used("download", format);
      return true;
    } catch {
      card.note(t("Couldn't download the palette."), true);
      return false;
    }
  };
  const copy = async (format: Format) => {
    try {
      await (await takers()).copyFormat(format, taken());
      used("copy", format);
      return true;
    } catch (reason) {
      /* a picture where none can go on the clipboard is saved instead */
      if (!(reason instanceof Error && reason.message === loaded?.NO_IMAGE_CLIPBOARD))
        card.note(t("Couldn't copy the palette."), true);
      else if (await download(format))
        card.note(t("Images can't be copied here, so the file was downloaded."));
      return false;
    }
  };
  const link = async (format: Format) => {
    try {
      await (await takers()).copyLink(format, taken());
      used("copy", `link:${format}`);
      return true;
    } catch {
      card.note(t("Couldn't copy the palette."), true);
      return false;
    }
  };
  return () => {
    void takers().catch(() => {});
    return (
      <FormatStrip
        size="sm"
        variant="art"
        copy={["url", "css", "svg", "png"]}
        download={FILES}
        swatches={SWATCH_CHIPS}
        link={FILES}
        onCopy={copy}
        onDownload={format => void download(format)}
        onLink={link}
      />
    );
  };
}
