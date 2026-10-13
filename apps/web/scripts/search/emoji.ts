/* The emoji the free search understands: each one the vocabulary phrase it stands for (🌊 ocean, 🎃 halloween, 💜 purple),
   read from Unicode's own names and keywords for emoji (CLDR annotations, English, under the Unicode License v3), so a
   reader who types one is answered from the snapshot with no model call. Writes public/search/emoji.json and prints the
   table for a look. Run it after a retrain, since the vocabulary decides which phrases an emoji can stand for.
     node scripts/search/emoji.ts          (fetches the CLDR file once into the cache) */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createLexicon } from "@grabient/search/lexicon.ts";
import { hasPictograph, normalizeQuery } from "@grabient/search/text.ts";
import { DROP, KIND, SAID, SECOND } from "./emoji.data.ts";
import { CACHE, PUBLIC } from "./paths.ts";

const CLDR =
  "https://raw.githubusercontent.com/unicode-org/cldr-json/48.0.0/cldr-json/cldr-annotations-full/annotations/en/annotations.json";
const cached = resolve(CACHE, "cldr-annotations-en.json");

interface Annotation {
  /** the emoji's names */
  tts?: string[];
  /** its keywords */
  default?: string[];
}

if (!existsSync(cached)) {
  const response = await fetch(CLDR);
  if (!response.ok) throw new Error(`The CLDR annotations answered ${response.status}.`);
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(cached, await response.text());
}
const annotations = (
  JSON.parse(readFileSync(cached, "utf8")) as {
    annotations: { annotations: Record<string, Annotation> };
  }
).annotations.annotations;

const vocab = JSON.parse(readFileSync(resolve(PUBLIC, "vocab.json"), "utf8")) as {
  phrases: string[];
};
const lexicon = createLexicon(JSON.parse(readFileSync(resolve(PUBLIC, "lex.json"), "utf8")));
const phraseOf = (text: string): string | null => {
  const hit = lexicon.exactHit(text);
  return hit ? vocab.phrases[hit.phrase] : null;
};
/* a name or a keyword counts only as the English phrase itself: through a translation, mai (from mai tai) would read
   as May */
const itself = (text: string): string | null =>
  phraseOf(text) === normalizeQuery(text) ? phraseOf(text) : null;

/* The tables by the key a query reaches them with. A key written in another form gives way to its normalized form. */
function byKey(table: Readonly<Record<string, string>>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, word] of Object.entries(table))
    if (normalizeQuery(key) === key) out.set(key, word);
  for (const [key, word] of Object.entries(table))
    if (normalizeQuery(key) !== key) out.set(normalizeQuery(key), word);
  return out;
}
const said = byKey(SAID);
const second = byKey(SECOND);

const out = new Map<string, string>();
const how = { said: 0, name: 0, keyword: 0 };
const byPhrase = new Map<string, string[]>();
for (const [emoji, { tts = [], default: keywords = [] }] of Object.entries(annotations)) {
  const key = normalizeQuery(emoji);
  if (!key || !hasPictograph(key) || out.has(key) || DROP.has(key)) continue;
  let way: keyof typeof how = "said";
  let phrase =
    [said.get(key), second.get(key)].map(word => (word ? phraseOf(word) : null)).find(Boolean) ??
    null;
  if (!phrase) {
    way = "name";
    phrase = tts.map(itself).find(Boolean) ?? null;
  }
  if (!phrase) {
    way = "keyword";
    phrase = keywords.map(word => (KIND.has(word) ? null : itself(word))).find(Boolean) ?? null;
  }
  if (!phrase) continue;
  out.set(key, phrase);
  how[way]++;
  byPhrase.set(phrase, [...(byPhrase.get(phrase) ?? []), key]);
  console.log(`${key}\t${phrase}\t${way}\t${tts.join("/")}`);
}

const missing = [...said].filter(
  ([key, word]) => !phraseOf(word) && !(second.get(key) && phraseOf(second.get(key)!))
);
console.log(
  `\n${out.size} emoji mapped (${how.said} said here, ${how.name} by name, ${how.keyword} by keyword); ${Object.keys(annotations).length} annotated`
);
console.log(
  "phrases said here that the vocabulary does not hold:",
  missing.map(([key, word]) => `${key} ${word}`).join(", ")
);
console.log(
  "most shared phrases:",
  [...byPhrase]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12)
    .map(([phrase, list]) => `${phrase} ${list.length}`)
    .join(", ")
);
// sorted as the file always was, by "emoji,phrase" in code units, so a rerun with the same inputs changes no byte
const line = ([key, phrase]: [string, string]) => `${key},${phrase}`;
const sorted = [...out].sort((a, b) => (line(a) < line(b) ? -1 : line(a) > line(b) ? 1 : 0));
writeFileSync(resolve(PUBLIC, "emoji.json"), JSON.stringify(Object.fromEntries(sorted)));
