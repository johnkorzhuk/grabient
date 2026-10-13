import { readFileSync } from "node:fs";
import { addCatalog } from "@grabient/i18n";
import { buildCatalogs } from "@grabient/i18n/vite.ts";

/* What the email tests share: the catalogs as the Worker holds them, the golden fixtures captured from grabient4, and
   the ways an email is read back. */

for (const [locale, file] of buildCatalogs()) addCatalog(locale, JSON.parse(file.source));

export const ORIGIN = "https://grabient.test";

export const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
export const fixtureJson = <T>(name: string): T => JSON.parse(fixture(name));

/** An email as its meaning: every gradient as its function, its direction, whether it blends or bands, and its colors.
    The site writes one gradient's stops at its own precision; the colors and their order are what a reader sees. */
export const meaning = (html: string): string =>
  html
    .replace(/(linear|radial|conic)-gradient\(([^)]*)\)/g, (_, kind: string, body: string) => {
      const items = body.split(/,\s*/);
      const head = items[0].startsWith("#")
        ? ""
        : (items.shift() ?? "").replace(/ at 50% 50%$/, "").replace(/^from /, "");
      const stops = items.map(item => item.trim().split(/\s+/));
      const kindOf = stops.some(stop => stop.length === 3) ? "bands" : "blend";
      return `${kind}(${kind === "radial" ? "" : head}|${kindOf}|${stops.map(stop => stop[0]).join(";")})`;
    })
    .replace(/offset="([\d.]+)"/g, (_, n: string) => `offset="${Number(n).toFixed(3)}"`);

export const decode = (text: string): string =>
  text.replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
export const hrefs = (html: string): string[] =>
  [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map(m => decode(m[1]));
export const srcs = (html: string): string[] =>
  [...html.matchAll(/<img\b[^>]*\bsrc="([^"]*)"/g)].map(m => decode(m[1]));
/** The pictures that stand in no link: Gmail lays a Download button over each. */
export const bare = (html: string): string[] =>
  html.replace(/<a\b[^>]*\bhref="[^"]+"[^>]*>[\s\S]*?<\/a>/g, "").match(/<img\b[^>]*>/g) ?? [];
export const classes = (html: string): Set<string> =>
  new Set([...html.matchAll(/\bclass="([^"]+)"/g)].flatMap(m => m[1].split(" ")));
export const styleBlocks = (html: string): string[] =>
  [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
export const inlineStyles = (html: string): string[] =>
  [...html.matchAll(/\bstyle="([^"]*)"/g)].map(m => decode(m[1]));
export const bytes = (text: string): number => Buffer.byteLength(text);
