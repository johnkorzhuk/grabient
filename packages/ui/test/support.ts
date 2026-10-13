import { readFileSync } from "node:fs";

/** A golden fixture's text: grabient4's output, which this code must reproduce. */
export const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
/** A golden fixture's JSON. */
export const golden = <T>(name: string): T => JSON.parse(fixture(`${name}.json`));
/** Rounds every number in a value to 4 places, as the fixtures were written. */
export const r4 = (v: unknown): unknown =>
  typeof v === "number"
    ? Math.round(v * 1e4) / 1e4
    : Array.isArray(v)
      ? v.map(r4)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r4(x)]))
        : v;
