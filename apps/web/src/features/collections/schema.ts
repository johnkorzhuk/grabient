import { decodePalette, encodePalette } from "@grabient/engine";
import {
  DEFAULT_ANGLE,
  DEFAULT_STEPS,
  DEFAULT_STYLE,
  STEPS_MAX,
  STEPS_MIN,
  STYLES,
  type Style
} from "@grabient/engine/view.ts";
import { formatMessage, msg, type Params } from "@grabient/i18n";
import * as v from "valibot";
import { itemKey } from "./address.ts";

/* A collection's words and palettes as every writer sends them: the site's pages, the account's copy, the sync and the
   apps. Words are kept as typed, composed (NFC) and never folded to their compatibility forms, which would take a Thai
   vowel apart or join Korean letters typed apart; a search folds them where it compares them. */

export const MAX_COLLECTION_ITEMS = 100;
export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 500;
export const TAGS_MAX = 12;
export const TAG_MAX = 32;
export const NOTE_MAX = 2000;
/** The most collections an account keeps, its copies included. */
export const MAX_OWN_COLLECTIONS = 200;

export type Visibility = "public" | "private";
/** A palette in a collection: its canonical seed in one view. */
export interface CollectionItemInput {
  seed: string;
  style: Style;
  steps: number;
  angle: number;
}
export interface CollectionInput {
  title: string;
  description: string;
  tags: string[];
  visibility: Visibility;
  items: CollectionItemInput[];
}

/** A refusal a reader may see: `error` is its English, which apps and agents read, and `i18n` the message and its
    values, which a page says in the reader's language. */
export interface Refusal {
  ok: false;
  error: string;
  i18n?: { message: string; params?: Params };
}
export const refusal = (message: string, params?: Params): Refusal => ({
  ok: false,
  error: formatMessage(message, params, "en"),
  ...(params ? { i18n: { message, params } } : {})
});

const whole = (min: number, max: number) =>
  v.pipe(v.number(), v.integer(), v.minValue(min), v.maxValue(max));

/** A member palette as sent: a seed that decodes, one of the six styles, and steps and angle in their bounds, each
    defaulted when left out. It comes out canonical, its steps raised to the palette's keyframes. */
export const CollectionItem = v.message(
  v.pipe(
    v.object({
      seed: v.pipe(v.string(), v.maxLength(64)),
      style: v.optional(v.picklist(STYLES), DEFAULT_STYLE),
      steps: v.optional(whole(1, STEPS_MAX), DEFAULT_STEPS),
      angle: v.optional(whole(0, 360), DEFAULT_ANGLE)
    }),
    v.rawTransform(({ dataset, addIssue, NEVER }): CollectionItemInput => {
      const { seed, style, steps, angle } = dataset.value;
      const palette = decodePalette(seed);
      if (!palette) {
        addIssue();
        return NEVER;
      }
      return {
        seed: encodePalette(palette),
        style,
        steps: Math.max(STEPS_MIN, palette.anchors.length, steps),
        angle
      };
    })
  ),
  msg("Invalid palette.")
);

/** A member palette as `CollectionItem` reads it, or null. */
export function collectionItem(value: unknown): CollectionItemInput | null {
  const read = v.safeParse(CollectionItem, value);
  return read.success ? read.output : null;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is taken out
const CONTROL = /[\u0000-\u001f\u007f]/gu;
/* Refused by length before composing, whose cost for a run of marks grows with its square: NFC makes one character of
   four at most. */
const line = (max: number, message: string, required = false) =>
  v.message(
    v.pipe(
      v.nullish(v.string(), ""),
      v.check(text => text.length <= max * 4),
      v.transform(text => text.normalize("NFC").replace(CONTROL, " ").replace(/\s+/gu, " ").trim()),
      v.minLength(required ? 1 : 0),
      v.maxLength(max)
    ),
    message
  );

/* A tag is letters with the marks that belong to them (a Thai tone, a Devanagari vowel sign), digits, spaces and
   hyphens; anything else reads as a space. A joiner stays between two letters or marks, where Persian and the Indic
   scripts spell words with one. What a reader never sees is dropped, so tags that read alike are one tag: a mark with no
   letter before it, a joiner anywhere else, and the two marks that draw nothing. */
const TAG_OTHER = /[^\p{L}\p{M}\p{N}\p{Join_Control}\s-]/gu;
const TAG_UNSEEN = /[͏️]/g;
const TAG_STRAY =
  /(?<![\p{L}\p{M}\p{Join_Control}])[\p{M}\p{Join_Control}]+|\p{Join_Control}+(?![\p{L}\p{M}])/gu;
/* two characters a reader sees at least, or the one character that is a word in Chinese, Japanese and Korean */
const TWO = /[\p{L}\p{N}].*[\p{L}\p{M}\p{N}]/u;
const ONE_CHARACTER_WORD =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]\p{M}*$/u;

const TITLE_RULE = msg("Titles are 1 to {max} characters.");
const DESCRIPTION_RULE = msg("Descriptions are up to {max} characters.");
const TAGS_RULE = msg("Use up to {max} tags.");
const TAG_RULE = msg("Tags are 2 to {max} letters, numbers, spaces or hyphens.");
const ITEMS_RULE = msg("Add 1 to {max} palettes.");
const RULE_PARAMS: Readonly<Record<string, Params>> = {
  [TITLE_RULE]: { max: String(TITLE_MAX) },
  [DESCRIPTION_RULE]: { max: String(DESCRIPTION_MAX) },
  [TAGS_RULE]: { max: String(TAGS_MAX) },
  [TAG_RULE]: { max: String(TAG_MAX) },
  [ITEMS_RULE]: { max: String(MAX_COLLECTION_ITEMS) }
};

const Title = line(TITLE_MAX, TITLE_RULE, true);
const Description = line(DESCRIPTION_MAX, DESCRIPTION_RULE);
const Tag = v.message(
  v.pipe(
    v.string(),
    v.maxLength(256),
    v.transform(raw =>
      raw
        .toLowerCase()
        .normalize("NFC")
        .replace(TAG_UNSEEN, "")
        .replace(TAG_OTHER, " ")
        .replace(TAG_STRAY, "")
        .replace(/\s+/gu, " ")
        .trim()
    ),
    v.check(tag => TWO.test(tag) || ONE_CHARACTER_WORD.test(tag)),
    v.maxLength(TAG_MAX)
  ),
  TAG_RULE
);
const Tags = v.pipe(
  v.message(v.pipe(v.array(v.unknown()), v.maxLength(TAGS_MAX)), TAGS_RULE),
  v.array(Tag),
  v.transform(tags => [...new Set(tags)])
);
const VisibilityField = v.picklist(["public", "private"], "Visibility is public or private.");
const Items = v.pipe(
  v.message(
    v.pipe(v.array(v.unknown()), v.minLength(1), v.maxLength(MAX_COLLECTION_ITEMS)),
    ITEMS_RULE
  ),
  v.array(CollectionItem),
  v.transform(items => {
    const seen = new Set<string>();
    return items.filter(item => !seen.has(itemKey(item)) && seen.add(itemKey(item)));
  })
);

function field<S extends v.GenericSchema>(schema: S, value: unknown): v.InferOutput<S> | Refusal {
  const read = v.safeParse(schema, value);
  if (read.success) return read.output;
  const message = read.issues[0].message;
  return message in RULE_PARAMS
    ? refusal(message, RULE_PARAMS[message])
    : { ok: false, error: message };
}
const refused = (value: unknown): value is Refusal =>
  typeof value === "object" && value !== null && (value as { ok?: unknown }).ok === false;

export type Validation = { ok: true; input: CollectionInput } | Refusal;

/** A collection as a writer sends it, checked field by field in this order: title, description, tags, visibility,
    palettes. With `base`, a field left out keeps its current value, and palettes sent replace the whole list. A new
    collection is private unless it says otherwise; whether it may be public is the server's to decide. */
export function validateCollection(
  body: Readonly<Record<string, unknown>>,
  base?: CollectionInput
): Validation {
  const kept = <K extends keyof CollectionInput>(key: K) =>
    base !== undefined && body[key] === undefined;
  const title = kept("title") ? base!.title : field(Title, body.title);
  if (refused(title)) return title;
  const description = kept("description")
    ? base!.description
    : field(Description, body.description);
  if (refused(description)) return description;
  const tags = body.tags === undefined ? (base?.tags ?? []) : field(Tags, body.tags);
  if (refused(tags)) return tags;
  const visibility =
    body.visibility === undefined
      ? (base?.visibility ?? "private")
      : field(VisibilityField, body.visibility);
  if (refused(visibility)) return visibility;
  const items = kept("items") ? base!.items : field(Items, body.items);
  if (refused(items)) return items;
  return { ok: true, input: { title, description, tags, visibility, items } };
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is taken out
const NOTE_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/gu;
/** A note for the agents as written: composed, its lines kept, control characters other than tabs and line breaks
    taken out, 1 to NOTE_MAX characters. Null for anything else. */
export const NoteText = v.pipe(
  v.string(),
  v.transform(text =>
    text.normalize("NFC").replace(/\r\n?/g, "\n").replace(NOTE_CONTROL, "").trim()
  ),
  v.minLength(1),
  v.maxLength(NOTE_MAX)
);
export function normalizeNote(text: unknown): string | null {
  const read = v.safeParse(NoteText, text);
  return read.success ? read.output : null;
}

/** A reader's word on whether a palette fits a collection: up, down, or null to take it back. */
export const FitVoteInput = v.object({
  seed: v.string(),
  vote: v.nullable(v.picklist(["up", "down"]))
});
export type FitVote = "up" | "down";
