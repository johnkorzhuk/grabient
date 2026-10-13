import { readFileSync } from "node:fs";

/** A golden fixture: outputs the engine must reproduce exactly, so a seed, a file or a name never changes unseen. */
export const golden = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

/** The fixtures' random source: s = (s · 1103515245 + 12345) & 0x7fffffff, rand = s / 0x7fffffff. */
export function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}
