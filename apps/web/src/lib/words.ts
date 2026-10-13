import { decodePalette, encodePalette } from "@grabient/engine";
import { alignedLegacySeed } from "@grabient/engine/legacy.ts";
import { delocalizePath } from "@grabient/i18n";
import { slugWords, typedCollection } from "../features/collections/address.ts";

/* The words of a search as every list's address writes them, so one search has one address: NFKC, one space between
   words, lowercase, 100 characters at most, no control characters. A palette is a search too, for the palettes like
   it: its seed in its own case, or a Grabient link in the words' place, read as the palette or the words it names. */

const WORDS_MAX = 100;
const OLD_SEED = /^[_~][A-Za-z0-9_-]{6,}$/;
const HOSTS = new Set([
  "grabient.com",
  "www.grabient.com",
  "grabient-lite.jkorzhuk.workers.dev",
  "staging.grabient.com"
]);
const LIST_PAGE = /^\/(?:(?:palettes|collections)(?:\/rising(?:\/(?:1w|3m|1y))?|\/saved)?)?$/;

/** Whether an address's host is one of Grabient's own. */
export const grabientHost = (hostname: string): boolean => HOSTS.has(hostname.toLowerCase());

/** A palette named in place of words: a seed as the codec writes it, or an old grabient.com id as its `_` seed, which
    the Worker's maps may know. Null for anything else. */
export function paletteId(raw: string): string | null {
  const palette = decodePalette(raw);
  return palette ? encodePalette(palette) : OLD_SEED.test(raw) ? raw : alignedLegacySeed(raw);
}

/** Text that reads as an address: with its scheme, a host and a path, or a path of this site. */
export const looksLikeLink = (raw: string): boolean =>
  /^\s*(?:https?:\/\/|[^/\s]+\.[^/\s]+\/|\/)/i.test(raw);

const decoded = (part: string) => {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
};

/** What a Grabient link searches for, and the view it draws in: the palette it names (its page in any language, its
    editor, its picture or data), or the words of a list's address or of a collection's. Null for a link off the site
    or to none of them. */
export function readLink(raw: string): { words: string; view: URLSearchParams } | null {
  const value = raw.trim();
  let url: URL;
  try {
    url = new URL(
      /^https?:\/\//i.test(value)
        ? value
        : value.startsWith("/")
          ? `https://grabient.com${value}`
          : `https://${value}`
    );
  } catch {
    return null;
  }
  if (!grabientHost(url.hostname) || url.username || url.password) return null;
  const view = new URLSearchParams();
  for (const name of ["style", "steps", "angle", "size"]) {
    const said = url.searchParams.get(name);
    if (said) view.set(name, said);
  }
  const path = delocalizePath(url.pathname).path.replace(/\.(?:png|svg|json|md)$/, "");
  if (/^\/api\/(?:og|png|palette)$/.test(path)) {
    const seed = paletteId(url.searchParams.get("seed") ?? "");
    return seed ? { words: seed, view } : null;
  }
  const one = /^\/([^/]+?)(?:\/edit)?$/.exec(path)?.[1];
  const named = one ? paletteId(decoded(one)) : null;
  if (named) return { words: named, view };
  const asked = url.searchParams.get("q") ?? url.searchParams.get("query");
  if (asked && LIST_PAGE.test(path)) return { words: listWords(asked), view };
  const old = /^\/palettes\/([^/]+)$/.exec(path)?.[1];
  if (old) return { words: listWords(decoded(old).replace(/-/g, " ")), view };
  const collection = typedCollection(path);
  return collection ? { words: listWords(slugWords(collection.slug)), view } : null;
}

/** Words as a search takes them; empty for words no search takes. */
export function listWords(raw: string | null | undefined): string {
  if (!raw) return "";
  if (looksLikeLink(raw)) return readLink(raw)?.words ?? "";
  const words = raw.normalize("NFKC").replace(/\s+/gu, " ").trim();
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
  if (!words || words.length > WORDS_MAX || /[\u0000-\u001f\u007f]/u.test(words)) return "";
  return paletteId(words) ?? words.toLowerCase();
}
