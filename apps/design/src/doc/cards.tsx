import { paletteTitle, seedName, seedReading } from "@grabient/engine/name.ts";
import { FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { locale, t } from "@grabient/ui/i18n.ts";
import type { Sample } from "../samples.ts";

/* What the document's palette cards need beside a sample: its name and its card's format strip, as a list draws them. */

/** What a sample's colors call it, in the reader's language. */
export const sampleName = (sample: Sample): string =>
  seedName(sample.seed, sample.style, sample.steps, { t, locale: locale() }) || t("Palette");
/** That name with its style, as a palette's page and its card's tooltip say it under a title of other words. */
export function sampleTitle(sample: Sample): string {
  const reading = seedReading(sample.seed, sample.style, sample.steps);
  return reading
    ? paletteTitle(reading, sample.style, { t, locale: locale() })
    : sampleName(sample);
}

/** A card's copies, downloads and links, as on a gallery card. */
export const cardTools = () => (
  <FormatStrip
    size="sm"
    variant="art"
    copy={["url", "css", "svg", "png"]}
    download={["md", "css", "svg", "png"]}
    swatches={SWATCH_CHIPS}
    link={["md", "css", "svg", "png"]}
  />
);
