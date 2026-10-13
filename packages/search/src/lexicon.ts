/* The vocabulary's keys: every normalized spelling, translation and emoji that leads to one of its phrases. A query
   found here is answered from stored numbers with no embedding call, the same for a misspelling or a translation as for
   the phrase itself. */
import {
  americanSpelling,
  britishSpelling,
  FORGIVING,
  hangulStem,
  hasPictograph,
  normalizeQuery,
  slip
} from "./text.ts";

/** normalized text -> the row of its phrase in the vocabulary */
export type LexiconFile = Record<string, number>;

export interface LexiconHit {
  phrase: number;
  how: "exact" | "typo";
  key: string;
}

export interface Lexicon {
  /** the text whole: exactly, or one slip off */
  lookup(text: string): LexiconHit | null;
  /** the text whole, exactly, in either spelling */
  exactHit(text: string): LexiconHit | null;
  /** one word: exactly, or a Korean noun without its particle */
  word(token: string): LexiconHit | null;
}

export function createLexicon(file: LexiconFile): Lexicon {
  const exactHit = (text: string): LexiconHit | null => {
    const t = normalizeQuery(text);
    const key = [t, americanSpelling(t), britishSpelling(t)].find(
      spelled => spelled && Object.hasOwn(file, spelled)
    );
    return key ? { phrase: file[key], how: "exact", key } : null;
  };
  /* A slip keeps the first letter, so only keys with the typed text's word count and first letter can be one slip off.
     Grouped once, on the first lookup that forgives, in the file's order, which settles ties as a scan of every key would. */
  let near: Map<string, string[]> | undefined;
  const nearKeys = (words: number, first: string) => {
    if (!near) {
      near = new Map();
      for (const key of Object.keys(file)) {
        const group = `${key.split(" ").length} ${key[0]}`;
        const list = near.get(group);
        if (list) list.push(key);
        else near.set(group, [key]);
      }
    }
    return near.get(`${words} ${first}`) ?? [];
  };
  return {
    exactHit,
    word(token) {
      const hit = exactHit(token);
      if (hit) return hit;
      const stem = hangulStem(normalizeQuery(token));
      return stem ? exactHit(stem) : null;
    },
    lookup(text) {
      const t = normalizeQuery(text);
      const exact = exactHit(t);
      if (exact || t.length < 4 || !FORGIVING.test(t)) return exact;
      // the same number of words, each equal or one slip off, two slipped words at most; fewest slips, then the shortest key
      const words = t.split(" ");
      let best: (LexiconHit & { slips: number }) | null = null;
      for (const key of nearKeys(words.length, t[0])) {
        const theirs = key.split(" ");
        let slips = 0;
        for (let j = 0; j < words.length && slips <= 2; j++) {
          if (words[j] !== theirs[j]) slips += slip(words[j], theirs[j]) ? 1 : 3;
        }
        if (
          slips > 0 &&
          slips <= 2 &&
          (!best || slips < best.slips || (slips === best.slips && key.length < best.key.length))
        ) {
          best = { phrase: file[key], how: "typo", key, slips };
        }
      }
      return best && { phrase: best.phrase, how: best.how, key: best.key };
    }
  };
}

/** The lexicon with emoji as keys, each leading to the phrase it stands for (🌊 ocean, 🎃 halloween) where the vocabulary
    holds that phrase. A key the lexicon already has is never replaced. */
export function withEmoji(
  file: LexiconFile,
  emoji: Readonly<Record<string, string>>,
  phrases: readonly string[]
): LexiconFile {
  const at = new Map(phrases.map((phrase, i) => [phrase, i]));
  const out: LexiconFile = { ...file };
  for (const [raw, phrase] of Object.entries(emoji)) {
    const key = normalizeQuery(raw);
    const row = at.get(phrase);
    if (key && hasPictograph(key) && row !== undefined && !Object.hasOwn(out, key)) out[key] = row;
  }
  return out;
}
