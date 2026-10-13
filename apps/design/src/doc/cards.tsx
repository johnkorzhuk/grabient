import { seedName } from "@grabient/engine/name.ts";
import { FormatStrip, SWATCH_CHIPS } from "@grabient/ui/FormatStrip.tsx";
import { locale, t } from "@grabient/ui/i18n.ts";
import type { Sample } from "../samples.ts";

/* What the document's palette cards need beside a sample: its name and its card's format strip, as a list draws them. */

/** What a sample's colors call it, in the reader's language. */
export const sampleName = (sample: Sample): string =>
  seedName(sample.seed, sample.style, sample.steps, { t, locale: locale() }) || t("Palette");

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
