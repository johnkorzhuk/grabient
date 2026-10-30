import { localHref, msg, t } from "@grabient/i18n";
import { downloadFile } from "@grabient/ui/copy.ts";
import type { Format } from "@grabient/ui/FormatStrip.tsx";
import { copyImage, writeText } from "../../lib/files.ts";
import { collectionSheet } from "../../lib/page-meta.ts";
import { shownError } from "../../lib/query.ts";

/* What a collection's strip hands over: the collection's own files as the site serves them at its address (its sheet,
   CSS, JSON, Markdown and swatch files), copied, saved, or their addresses copied. What could not be done is said on
   the page's line, in the reader's language. */

/** The formats a collection's strip offers, beside the swatch files (SWATCH_CHIPS). */
export const COLLECTION_FORMATS = {
  copy: ["url", "css", "svg", "png", "json"],
  download: ["md", "css", "svg", "png", "json"],
  link: ["md", "css", "svg", "png", "json"]
} as const satisfies Record<string, readonly Format[]>;

const EXTENSION: Partial<Record<Format, string>> = {
  css: "css",
  svg: "svg",
  png: "png",
  json: "json",
  md: "md",
  ase: "ase",
  gpl: "gpl",
  grd: "grd",
  tokens: "tokens.json"
};

export interface Shared {
  slug: string;
  /** when it last changed: its sheet's address carries it, so a changed collection is drawn again */
  updatedAt: number;
}

const page = (c: Shared) => `${location.origin}${localHref(`/${c.slug}`)}`;
const address = (c: Shared, format: Format) => `${location.origin}/${c.slug}.${EXTENSION[format]}`;
const named = (c: Shared, format: Format) => `${c.slug.split("/").pop()}.${EXTENSION[format]}`;
/* the sheet by when it changed, as its page shows it; any other file as it is now */
const fileOf = (c: Shared, format: Format) =>
  format === "png"
    ? collectionSheet(c.slug, c.updatedAt)
    : format === "svg"
      ? `/${c.slug}.svg?t=${c.updatedAt}`
      : `/${c.slug}.${EXTENSION[format]}`;

async function read(c: Shared, format: Format): Promise<Response> {
  const answer = await fetch(fileOf(c, format));
  if (!answer.ok) throw new Error(t("Couldn't download the file."));
  return answer;
}

/** What a collection's strip does with the collection `shared` names. */
export function collectionTakings(
  shared: () => Shared,
  say: (message: string, error?: boolean) => void
) {
  const refused = (fallback: string) => (reason: unknown) => {
    say(shownError(reason, fallback), true);
    return false;
  };
  return {
    copy: (format: Format) =>
      (async () => {
        const c = shared();
        if (format === "url") {
          await writeText(page(c));
          return true;
        }
        if (format === "png") {
          if (await copyImage(read(c, "png").then(answer => answer.blob()))) return true;
          downloadFile(named(c, "png"), await (await read(c, "png")).blob());
          say(t("Images can't be copied here, so the file was downloaded."));
          return false;
        }
        await writeText(await (await read(c, format)).text());
        return true;
      })().catch(refused(msg("Couldn't copy."))),
    download: (format: Format) =>
      void (async () => {
        const c = shared();
        if (format === "url") return writeText(page(c));
        downloadFile(named(c, format), await (await read(c, format)).blob());
      })().catch(refused(msg("Couldn't download the file."))),
    link: (format: Format) =>
      writeText(address(shared(), format)).then(() => true, refused(msg("Couldn't copy.")))
  };
}
