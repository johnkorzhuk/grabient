/* A query as the vocabulary reads it: normalized, split into words in every script, spelled the American way, and the
   color relationship it names. Case, punctuation and spacing never decide a match. */
import type { Harmony } from "@grabient/engine/shape.ts";

/** The longest query read, in code points. A search takes no longer one, so what it takes reaches the vocabulary and
    the model whole. */
export const QUERY_MAX = 100;

const PICTOGRAPH = /\p{Extended_Pictographic}/u;
/* an emoji: a pictograph, or several joined into one (a family, an astronaut) */
const EMOJI = /\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*/gu;

export const hasPictograph = (text: string): boolean => PICTOGRAPH.test(text);

/** NFKC, lowercase, and only letters, marks, digits and emoji: marks stay, since they are the vowels of Hindi and the
    accents of others. Each emoji is a word of its own, without the pieces that change how it is drawn and never what it
    means (the presentation selector, a keycap, a skin tone), so ❄️ and ❄ are one word. A title, a tag or a description
    is read this way to its end. */
export function normalizeText(text: string): string {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[️⃣\p{Emoji_Modifier}]/gu, "")
      .replace(/[^\p{L}\p{M}\p{N}\s\p{Extended_Pictographic}‍]/gu, " ")
      // the joiner holds only between two pictographs; anywhere else it separates words
      .replace(/(?<!\p{Extended_Pictographic})‍|‍(?!\p{Extended_Pictographic})/gu, " ")
      .replace(EMOJI, " $& ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** A query as the vocabulary reads it: the text normalized, then cut at QUERY_MAX code points, never through a
    character. */
export function normalizeQuery(text: string): string {
  return Array.from(normalizeText(text)).slice(0, QUERY_MAX).join("").trim();
}

/* scripts written without spaces between words, which the segmenter splits */
const UNSPACED =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
export const unspaced = (text: string): boolean => UNSPACED.test(text);

let segmenter: Intl.Segmenter | undefined;
function segmented(run: string): string[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "word" });
  const words: string[] = [];
  // NFKC splits Thai sara am in two and the segmenter would cut a word there, so it reads the letter whole
  for (const part of segmenter.segment(run.replace(/ํา/g, "ำ"))) {
    if (part.isWordLike) words.push(part.segment.normalize("NFKC"));
  }
  return words.length ? words : [run];
}

const tokensOf = (normalized: string): string[] =>
  normalized
    .split(" ")
    .filter(Boolean)
    .flatMap(token => (UNSPACED.test(token) ? segmented(token) : [token]));

/** The words of a query: what spaces separate, and inside Chinese, Japanese, Thai and the like, what the segmenter finds. */
export const queryTokens = (text: string): string[] => tokensOf(normalizeQuery(text));

/** The words of a text read to its end, split as a query's are. */
export const textTokens = (text: string): string[] => tokensOf(normalizeText(text));

/** Words back into text as the vocabulary writes it: a space between them, none inside an unspaced script. */
export const joinTokens = (tokens: readonly string[]): string =>
  tokens.reduce(
    (text, token, i) =>
      i === 0
        ? token
        : text + (UNSPACED.test(tokens[i - 1]) && UNSPACED.test(token) ? "" : " ") + token,
    ""
  );

const HANGUL = /^\p{Script=Hangul}+$/u;
/* the particles Korean attaches to a noun, longest first */
const PARTICLES = [
  "으로",
  "에서",
  "까지",
  "부터",
  "에게",
  "이나",
  "의",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "와",
  "과",
  "에",
  "로",
  "도",
  "만"
];

/** A Korean word without the particle on its end (바다의, of the sea, is 바다), or null when it has none. */
export function hangulStem(word: string): string | null {
  if (!HANGUL.test(word)) return null;
  const particle = PARTICLES.find(p => word.length > p.length && word.endsWith(p));
  return particle ? word.slice(0, -particle.length) : null;
}

/* One slip between a typed word and a known one that starts alike, forgiven by how much of the word is left to tell the
   two apart. From four letters: two neighbors swapped, a letter doubled or undoubled, an accent left off or put on. From
   five: a letter added or dropped. From six: a plain letter changed for another (song is no slip of sáng). Forgiving
   more reads plain words as other words: home as hope, blend as bland. */
export function slip(typed: string, known: string): boolean {
  const lt = typed.length;
  const lk = known.length;
  if (lt < 4 || typed === known || typed[0] !== known[0] || Math.abs(lt - lk) > 1) return false;
  let i = 1;
  while (i < lt && i < lk && typed[i] === known[i]) i++;
  if (lt !== lk) {
    const [long, short] = lt > lk ? [typed, known] : [known, typed];
    return (
      long.slice(i + 1) === short.slice(i) &&
      (lt >= 5 || long[i] === long[i - 1] || long[i] === long[i + 1])
    );
  }
  if (
    typed[i] === known[i + 1] &&
    typed[i + 1] === known[i] &&
    typed.slice(i + 2) === known.slice(i + 2)
  ) {
    return true;
  }
  const bt = typed[i].normalize("NFD")[0];
  const bk = known[i].normalize("NFD")[0];
  return (
    typed.slice(i + 1) === known.slice(i + 1) &&
    (bt === bk || (lt >= 6 && bt === typed[i] && bk === known[i]))
  );
}

/** Spelling is forgiven only where that is safe: Latin and Cyrillic letters and spaces. Looser, it reads beige as neige
    and clam as clay, which is worse than no match. */
export const FORGIVING = /^[a-zÀ-ɏЀ-ӿ ]+$/;

/** One typed word against one known word, with the vocabulary's forgiveness: equal, or one slip away. Names the
    vocabulary cannot know (a team, a game) are matched this way against the titles people gave. */
export const nearWord = (typed: string, known: string): boolean =>
  typed === known || (FORGIVING.test(typed) && FORGIVING.test(known) && slip(typed, known));

/* The site is written in American English and indexes one page per meaning, so a phrase's American spelling is the
   phrase itself (light gray, not light grey). Whole words only: greyhound stays. */
const SPELLINGS: Readonly<Record<string, string>> = {
  grey: "gray",
  greys: "grays",
  greyish: "grayish",
  colour: "color",
  colours: "colors",
  centre: "center"
};
const BRITISH: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(SPELLINGS).map(([british, american]) => [american, british])
);
export const americanSpelling = (text: string): string =>
  text.replace(/\b(?:greyish|greys|grey|colours|colour|centre)\b/g, word => SPELLINGS[word]);
export const britishSpelling = (text: string): string =>
  text.replace(/\b(?:grayish|grays|gray|colors|color|center)\b/g, word => BRITISH[word]);

/* first match wins, so split complementary is read before complementary */
const RELATIONSHIPS: readonly (readonly [RegExp, readonly Harmony[]])[] = [
  [/split.?complementary/, ["split-complementary"]],
  [/complementary|complimentary/, ["complementary"]],
  [/analogous/, ["analogous"]],
  [/monochromatic|monochrome/, ["monochromatic"]],
  [/triadic|triad/, ["triadic"]],
  [/tetradic/, ["tetradic"]],
  [/rainbow|spectrum/, ["rainbow", "multi-hue"]]
];
/** The relationships a query asks for: a search that names one keeps only the palettes in it. */
export const harmonyFilter = (text: string): readonly Harmony[] | null =>
  RELATIONSHIPS.find(([pattern]) => pattern.test(text))?.[1] ?? null;
