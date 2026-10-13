/* The search files the app ships, read from apps/web/public/search, and the package's golden fixtures. */
import { readFileSync } from "node:fs";

const PUBLIC = new URL("../../../apps/web/public/search/", import.meta.url);

export const searchFile = (name: string): Uint8Array => readFileSync(new URL(name, PUBLIC));
export const searchJson = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(name, PUBLIC), "utf8")) as T;
export const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(new URL(`fixtures/${name}`, import.meta.url), "utf8")) as T;

export interface VocabFile {
  version: string;
  d: number;
  phrases: string[];
  kinds: [number, string][];
}
