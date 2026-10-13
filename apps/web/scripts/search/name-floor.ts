/* Where a title's word stops meaning a query. Prints each pair of a searched word and a word of a public collection's
   title that stand between two bounds of closeness in the vocabulary's space, closest first, with one title that holds
   the word. Read down the list to where the same thing said another way ends and neighbors begin: that closeness is
   NAME_FLOOR, by which the collections decide what a title names. Measure it again after the text side is retrained.
     node scripts/search/name-floor.ts [from=0.68] [to=0.82]      (reads public/search, writes nothing) */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeSnapshot } from "@grabient/search/snapshot.ts";
import { loadVocabulary, phraseVector } from "../../src/server/search/files.ts";
import { isEmoji, rankSearches } from "../../src/server/search/popular.ts";
import { knownQuery, titleNames } from "../../src/server/search/read.ts";
import { assets } from "../../src/server/search/testing.ts";
import { PUBLIC } from "./paths.ts";

interface Pair {
  closeness: number;
  words: string;
  word: string;
  title: string;
}

const from = Number(process.argv[2] ?? 0.68);
const to = Number(process.argv[3] ?? 0.82);
const voc = await loadVocabulary({ ASSETS: assets() });
if (!voc) throw new Error("The vocabulary in public/search did not load.");
// the shipped base: the collections a deploy starts from
const snapshot = decodeSnapshot(readFileSync(resolve(PUBLIC, "snapshot.bin")));
const titles = snapshot.names.map(name => ({
  subject: name.subject,
  rows: titleNames(voc, name.subject)
}));

const pairs = new Map<string, Pair>();
for (const { words } of rankSearches(voc)) {
  const read = knownQuery(voc, words);
  if (!read?.whole || read.rows.length !== 1 || isEmoji(words)) continue;
  const mine = phraseVector(voc, read.rows[0]);
  for (const title of titles) {
    for (const row of title.rows) {
      const key = `${words}\n${voc.phrases[row]}`;
      if (row === read.rows[0] || pairs.has(key)) continue;
      const theirs = phraseVector(voc, row);
      let closeness = 0;
      for (let j = 0; j < voc.d; j++) closeness += mine[j] * theirs[j];
      if (closeness >= from && closeness < to) {
        pairs.set(key, { closeness, words, word: voc.phrases[row], title: title.subject });
      }
    }
  }
}
for (const pair of [...pairs.values()].sort((a, b) => b.closeness - a.closeness)) {
  console.log(`${pair.closeness.toFixed(3)}  ${pair.words}  ~  ${pair.word}    (${pair.title})`);
}
console.log(`${pairs.size} pairs from ${from} to ${to}`);
