import { encodePalette } from "@grabient/engine";
import { fromSpec } from "@grabient/engine/spec.ts";
import { parseView, viewSearch } from "@grabient/engine/view.ts";
import { msg } from "@grabient/i18n";
import { grabientHost, listWords, looksLikeLink, paletteId, readLink } from "../../lib/words.ts";

/* What a list's search field holds, read as Enter reads it: words or a palette to search for (with the view a pasted
   link draws in), exported palette JSON to open in the editor, or why the text cannot be searched, as a message. */

export type FieldRead =
  | { words: string; view?: URLSearchParams }
  | { open: string }
  | { error: string };

/** A link or palette JSON pasted whole is longer than any words. */
export const FIELD_MAX = 2048;
const WORDS_MAX = 100;

function readJson(value: string): FieldRead {
  try {
    const json = JSON.parse(value);
    const palette = fromSpec(json?.spec ?? json);
    if (!palette) return { error: msg("Paste palette JSON from Grabient.") };
    const said = new URLSearchParams();
    for (const key of ["style", "steps", "angle"]) {
      const v = json?.[key];
      if (typeof v === "string" || typeof v === "number") said.set(key, String(v));
    }
    const view = parseView(said);
    const steps = Math.max(view.steps, palette.anchors.length);
    return { open: `/${encodePalette(palette)}${viewSearch({ ...view, steps })}` };
  } catch {
    return { error: msg("Couldn't read this palette JSON.") };
  }
}

function readLinked(value: string): FieldRead {
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
    return { error: msg("Couldn't read this palette link.") };
  }
  /* a link copied from the page the reader is on is Grabient's own, whatever host serves it */
  const own =
    grabientHost(url.hostname) || (typeof location !== "undefined" && url.host === location.host);
  if (!own || url.username || url.password || !/^https?:$/.test(url.protocol)) {
    return { error: msg("Only Grabient links can be opened here.") };
  }
  const link = readLink(`https://grabient.com${url.pathname}${url.search}`);
  return link?.words ? link : { error: msg("Paste a link to one palette.") };
}

export function readField(text: string): FieldRead {
  const value = text.trim();
  if (!value) return { error: msg("Enter a color, mood or palette link.") };
  if (value.length > FIELD_MAX)
    return { error: msg("Links and JSON can be up to 2,048 characters.") };
  if (value.startsWith("{") || value.startsWith("[")) return readJson(value);
  const seed = paletteId(value);
  if (seed) return { words: seed };
  if (looksLikeLink(value)) return readLinked(value);
  const words = value.normalize("NFKC").replace(/\s+/gu, " ");
  if (words.length > WORDS_MAX) return { error: msg("Word searches can be up to 100 characters.") };
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
  if (/[\u0000-\u001f\u007f/\\]/u.test(words)) {
    return { error: msg("Search with words or hex colors, or paste a palette link.") };
  }
  return { words: listWords(words) };
}

/** What the field's text asks the tags for: its words as an address writes them, or the palette it names. */
export function typedWords(text: string): string {
  const read = readField(text);
  return "words" in read ? read.words : "";
}

/* whether one keystroke leads from one text to the other: a letter typed, deleted or typed over */
function oneKey(before: string, text: string): boolean {
  if (Math.abs(text.length - before.length) > 1) return false;
  const short = Math.min(before.length, text.length);
  let head = 0;
  while (head < short && before[head] === text[head]) head++;
  let tail = 0;
  while (tail < short - head && before.at(-1 - tail) === text.at(-1 - tail)) tail++;
  return Math.max(before.length, text.length) - head - tail <= 1;
}

/** Whether the field now holds a palette or a Grabient link that arrived whole, pasted or dropped where `before`
    stood: it says all it has to say, so the page searches at once. Words wait for Enter, since more may follow, and so
    does anything typed a letter at a time. */
export function arrivedWhole(text: string, before: string): boolean {
  if (oneKey(before, text)) return false;
  const value = text.trim();
  return "words" in readField(value) && (!!paletteId(value) || looksLikeLink(value));
}
