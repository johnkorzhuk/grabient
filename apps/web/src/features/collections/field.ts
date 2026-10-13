import { encodePalette } from "@grabient/engine";
import { fromSpec } from "@grabient/engine/spec.ts";
import { parseView, viewSearch } from "@grabient/engine/view.ts";
import { msg } from "@grabient/i18n";
import { grabientHost, listQuery, looksLikeLink, paletteId } from "./query.ts";

/* What a collections search field holds, read as Enter reads it: words or a palette to search the collections by (a
   palette with the view its pasted link draws in), exported palette JSON to open in the editor, or why the text
   cannot be searched, as a message. */

export type FieldRead =
  | { words: string; palette?: boolean; view?: URLSearchParams }
  | { open: string }
  | { error: string };

/** A link or palette JSON pasted whole is longer than any words. */
export const FIELD_MAX = 2048;
const WORDS_MAX = 100;
const VIEW_KEYS = ["style", "steps", "angle"] as const;

const viewOf = (from: { get(key: string): unknown }) => {
  const view = new URLSearchParams();
  for (const key of VIEW_KEYS) {
    const value = from.get(key);
    if (typeof value === "string" || typeof value === "number") view.set(key, String(value));
  }
  return view;
};

function readJson(value: string): FieldRead {
  try {
    const json = JSON.parse(value);
    const palette = fromSpec(json?.spec ?? json);
    if (!palette) return { error: msg("Paste palette JSON from Grabient.") };
    const view = parseView(viewOf({ get: (key: string) => json?.[key] }));
    const steps = Math.max(view.steps, palette.anchors.length);
    return { open: `/${encodePalette(palette)}${viewSearch({ ...view, steps })}` };
  } catch {
    return { error: msg("Couldn't read this palette JSON.") };
  }
}

function readLink(value: string): FieldRead {
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
  if (!grabientHost(url.host) || url.username || url.password || !/^https?:$/.test(url.protocol))
    return { error: msg("Only Grabient links can be opened here.") };
  const words = listQuery(`https://grabient.com${url.pathname}${url.search}`);
  if (!words) return { error: msg("Paste a link to one palette.") };
  if (!paletteId(words)) return { words };
  const view = viewOf(url.searchParams);
  return { words, palette: true, ...(view.size ? { view } : {}) };
}

/** The field's text as Enter reads it. */
export function readField(text: string): FieldRead {
  const value = text.trim();
  if (!value) return { error: msg("Enter a color, mood or palette link.") };
  if (value.length > FIELD_MAX)
    return { error: msg("Links and JSON can be up to 2,048 characters.") };
  if (value.startsWith("{") || value.startsWith("[")) return readJson(value);
  const seed = paletteId(value);
  if (seed) return { words: seed, palette: true };
  if (looksLikeLink(value)) return readLink(value);
  const words = value.normalize("NFKC").replace(/\s+/gu, " ");
  if (words.length > WORDS_MAX) return { error: msg("Word searches can be up to 100 characters.") };
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is refused
  if (/[\u0000-\u001f\u007f/\\]/u.test(words))
    return { error: msg("Search with words or hex colors, or paste a palette link.") };
  return { words: listQuery(words) };
}

/** What the field's text asks the tags for while it is typed: its words as an address writes them, or the palette it
    names. Words Enter would refuse are still the words they are; a link that names nothing, and JSON, are nothing. */
export function typedWords(text: string): string {
  const read = readField(text);
  if ("words" in read) return read.words;
  return "open" in read || looksLikeLink(text) ? "" : listQuery(text);
}

/* whether one keystroke leads from one text to the other: a letter typed, deleted or typed over */
function oneKey(before: string, text: string): boolean {
  if (Math.abs(text.length - before.length) > 1) return false;
  const short = Math.min(before.length, text.length);
  let head = 0;
  while (head < short && before[head] === text[head]) head++;
  let tail = 0;
  while (tail < short - head && before[before.length - 1 - tail] === text[text.length - 1 - tail])
    tail++;
  return Math.max(before.length, text.length) - head - tail <= 1;
}

/** Whether the field's text is a palette or a Grabient link that arrived whole, pasted or dropped in where `before`
    stood: it says all it has to, so the page searches by it at once. Words wait for Enter, since more may follow. */
export function arrivedWhole(text: string, before: string): boolean {
  if (oneKey(before, text)) return false;
  const read = readField(text);
  return "words" in read && (!!read.palette || looksLikeLink(text));
}
