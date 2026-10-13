import { nearWord, unspaced } from "@grabient/search/text.ts";
import { FORM_WORDS, FUNCTION_WORDS } from "@grabient/search/words.ts";

/* How a collection's letters answer what was typed. A typed word of four letters or more is found inside another (wood
   in redwood); a shorter one only where a word begins, since three letters inside a word are chance, the red of
   weathered and the art of earthy. Scripts written without spaces have no such beginnings, and hold a word anywhere. */

/** Words as a search compares them: compatibility forms, lowercase. The words themselves are kept as typed. */
export const folded = (words: string): string => words.normalize("NFKC").toLowerCase();

const LETTER = /[\p{L}\p{M}\p{N}]/u;
const anywhere = (word: string) => word.length > 3 || unspaced(word);

/** Whether text holds a typed word, as letters hold it (above). */
export function holds(text: string, word: string): boolean {
  if (anywhere(word)) return text.includes(word);
  for (let at = text.indexOf(word); at >= 0; at = text.indexOf(word, at + 1))
    if (!at || !LETTER.test(text[at - 1]!)) return true;
  return false;
}

/* what never counts as letters of a word: the two marks that draw nothing, and a mark or joiner on nothing */
const UNSEEN = /[͏️]/g;
const STRAY =
  /(?<![\p{L}\p{M}\p{Join_Control}])[\p{M}\p{Join_Control}]+|\p{Join_Control}+(?![\p{L}\p{M}])/gu;
const ONE_CHARACTER_WORD =
  /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]\p{M}*$/u;

/** A query's words with their marks, as a tag keeps them: two characters or more, or the one that is a word in Chinese,
    Japanese and Korean. A joiner parts them as a space does. At most six, in order of first mention. */
export function searchTokens(query: string): string[] {
  const tokens = folded(query)
    .replace(UNSEEN, "")
    .replace(STRAY, "")
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(token => token.length >= 2 || ONE_CHARACTER_WORD.test(token));
  return [...new Set(tokens)].slice(0, 6);
}

/* How well letters answer what was typed: 6 the words themselves, 5 they begin with what was typed, 4 they hold it, 3
   what was typed is a longer form of them, 2 a letter off. From NAMED up a title holds the words; a letter off is a
   guess, forgiven as the vocabulary forgives it, with the same first letter, so gold is not bold and mint not tint. */
export const NAMED = 3;

function wholeCloseness(title: string, typed: string): number {
  if (title === typed) return 6;
  if (title.startsWith(typed)) return 5;
  if (holds(title, typed)) return 4;
  if (title.length >= 3 && holds(typed, title)) return 3;
  return nearWord(typed, title) ? 2 : 0;
}

/* One typed word against one word of a title. A longer form is a plural or the like, a letter or two more: sunsets for
   sunset, while sunset is no form of sun. A word of grammar answers only itself, so the and of Red and black is no
   part of candy. */
function wordCloseness(word: string, typed: string): number {
  if (word === typed) return 6;
  if (FORM_WORDS.has(word) || FUNCTION_WORDS.has(word)) return 0;
  if (word.startsWith(typed)) return 5;
  if (anywhere(typed) && word.includes(typed)) return 4;
  if (word.length >= 3 && typed.startsWith(word) && typed.length - word.length <= 2) return 3;
  return nearWord(typed, word) ? 2 : 0;
}

/** How well a folded title answers folded words: the whole title, or each typed word against the title's words. */
export function titleCloseness(title: string, query: string): number {
  const words = title.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  const tokens = query.split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const whole = wholeCloseness(title, query);
  const per = tokens.map(token => Math.max(0, ...words.map(word => wordCloseness(word, token))));
  return per.some(x => x === 0)
    ? whole
    : Math.max(whole, per.reduce((a, b) => a + b, 0) / per.length);
}

export interface Lettered {
  title: string;
  description: string;
  /** the tags as the row keeps them: JSON text */
  tags: string;
}

/** How a collection's words mention the tokens: its title 3 a token, its tags 2, its description 1, and the whole
    phrase in its title 2 more. */
export function mentions(row: Lettered, tokens: readonly string[]): number {
  const title = folded(row.title);
  const tags = folded(row.tags);
  const description = folded(row.description);
  let score = 0;
  for (const token of tokens) {
    if (holds(title, token)) score += 3;
    if (holds(tags, token)) score += 2;
    if (holds(description, token)) score += 1;
  }
  if (tokens.length > 1 && title.includes(tokens.join(" "))) score += 2;
  return score;
}

/** How well one of an owner's collections answers what was typed: its title first, a letter off allowed and word by
    word, then the words found in its tags and description. Zero is no match. */
export function ownCloseness(row: Lettered, query: string): number {
  const typed = query.toLowerCase();
  const tokens = searchTokens(typed);
  return (
    titleCloseness(folded(row.title), typed) * 4 +
    (tokens.length ? mentions({ ...row, title: "" }, tokens) : 0)
  );
}

/* A title names its subject, sometimes with the form it comes in: the subject is what people search for. */
const FORM =
  /\s+(?:color palettes?|colour palettes?|color schemes?|gradients?|swatch(?:es)?|palettes?|colors|colours)$/i;
/** A title's subject: the title without the form it names at its end (Ocean gradients is Ocean). */
export function subjectOf(title: string): string {
  const whole = title.trim();
  return whole.replace(FORM, "").replace(FORM, "").trim() || whole;
}

/** A collection's own words as one folded text. */
export const wordsOf = (row: Lettered) => folded(`${row.title} ${row.tags} ${row.description}`);
