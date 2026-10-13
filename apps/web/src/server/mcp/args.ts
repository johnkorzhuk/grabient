import { decodePalette, encodePalette } from "@grabient/engine/codec.ts";
import { parseView } from "@grabient/engine/view.ts";
import { legacySeed } from "../seo/legacy.ts";
import type { PaletteGiven } from "./cards.ts";

/* An account tool's arguments, read against its JSON schema before it runs: a call learns in a sentence what was wrong
   and what is taken. The admins' tools read their own (tool.ts str, num, items, entryOf). */

/** A palette's canonical seed, from its seed or an old grabient.com id the legacy maps hold. */
function canonicalPaletteSeed(raw: string): string | null {
  const palette = decodePalette(legacySeed(raw) ?? raw);
  return palette ? encodePalette(palette) : null;
}

/** A palette as a call names it: its seed, or its address on any origin, in any language, with or without a file's
    ending, or its card's address. A seed names no view; an address names a whole one, as its page draws it: what its
    query leaves out is the default. Null when the text names no palette. */
export function paletteNamed(named: string): PaletteGiven | null {
  if (named.length > 400) return null;
  const bare = canonicalPaletteSeed(named);
  if (bare) return { seed: bare };
  let url: URL;
  try {
    url = new URL(named, "https://palette.invalid");
  } catch {
    return null;
  }
  // the palette's page and its files hold the seed in the path, its card (/api/og) in the query
  const last = (url.pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  const seed =
    canonicalPaletteSeed(last) ?? canonicalPaletteSeed(url.searchParams.get("seed") ?? "");
  if (!seed) return null;
  const { style, steps, angle } = parseView(url.searchParams);
  return { seed, style, steps, angle };
}

interface Schema {
  type?: string;
  description?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  items?: Schema;
  properties?: Record<string, Schema>;
  required?: string[];
}

// brought into range, never refused: the answer names what was used
const BROUGHT = ["limit", "page", "steps"];
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
class Refused extends Error {}

/** What a call sent, for a refusal to name. */
function sent(value: unknown): string {
  const said = Array.isArray(value)
    ? `a list of ${value.length}`
    : (JSON.stringify(value) ?? String(value));
  return said.length > 60 ? `${said.slice(0, 59)}…` : said;
}

/** What a schema takes, in a refusal's words. */
function takes(s: Schema): string {
  if (s.enum) return `one of ${s.enum.join(", ")}`;
  if (s.type === "integer" || s.type === "number") {
    const range = s.minimum === undefined ? "" : ` from ${s.minimum} to ${s.maximum}`;
    return `a ${s.type === "integer" ? "whole " : ""}number${range}`;
  }
  if (s.type === "boolean") return "true or false";
  if (s.type === "array") return `a list of ${s.minItems} to ${s.maxItems}`;
  if (s.type === "object") return `an object with ${Object.keys(s.properties ?? {}).join(", ")}`;
  return s.maxLength ? `text of at most ${s.maxLength} characters` : "text";
}

/** One value read as its schema says. `name` is what a refusal calls it, with where it sits: "palette 2: steps". */
function read(s: Schema, value: unknown, name: string): unknown {
  const wrong = (): never => {
    throw new Refused(`${name} is ${takes(s)}: ${sent(value)} was sent.`);
  };
  if (s.type === "object") {
    const properties = s.properties ?? {};
    const required = s.required ?? [];
    const palette = "seed" in properties;
    const at = name && `${name}: `;
    const given = palette && typeof value === "string" ? { seed: value } : value;
    if (!given || typeof given !== "object" || Array.isArray(given)) return wrong();
    const out: Record<string, unknown> = {};
    for (const [key, field] of Object.entries(given)) {
      const property = Object.hasOwn(properties, key) ? properties[key] : null;
      if (!property) {
        throw new Refused(
          `${at}${sent(key)} is not a name this takes: ${Object.keys(properties).join(", ") || "it takes none"}.`
        );
      }
      // what an app sends for nothing: null, and an empty list where the list may be left out
      if (field == null) continue;
      if (Array.isArray(field) && !field.length && property.minItems && !required.includes(key))
        continue;
      out[key] = read(property, field, at + key);
    }
    for (const key of required) {
      if (out[key] === undefined)
        throw new Refused(`${at}${key} is needed: ${properties[key]?.description}`);
    }
    if (!palette) return out;
    const named = paletteNamed(out.seed as string);
    if (!named) throw new Refused(`${at}seed ${sent(out.seed)} is no palette's seed or address.`);
    // the view an address carries stands unless the call names the same field itself
    return { ...named, ...out, seed: named.seed };
  }
  if (s.type === "array") {
    if (
      !Array.isArray(value) ||
      value.length < (s.minItems ?? 0) ||
      value.length > (s.maxItems ?? Infinity)
    )
      return wrong();
    const each = `${name.replace(/s$/, "")} `;
    return value.map((item, i) => read(s.items ?? {}, item, `${each}${i + 1}`));
  }
  if (s.type === "boolean") {
    const word = typeof value === "string" ? value.trim().toLowerCase() : value;
    return word === true || word === "true"
      ? true
      : word === false || word === "false"
        ? false
        : wrong();
  }
  if (s.type === "integer" || s.type === "number") {
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && NUMBER.test(value.trim())
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(n) || (s.type === "integer" && !Number.isInteger(n))) return wrong();
    const used = Math.max(s.minimum ?? -Infinity, Math.min(s.maximum ?? Infinity, n));
    return used === n || BROUGHT.includes(name.split(" ").pop() ?? "") ? used : wrong();
  }
  if (typeof value !== "string") return wrong();
  const typed = value.normalize("NFC").trim();
  return (s.enum && !s.enum.includes(typed)) || typed.length > (s.maxLength ?? Infinity)
    ? wrong()
    : typed;
}

/** A call's arguments read as its tool's schema says. A name the tool does not take, or a value of another kind, out
    of range or too long, is refused in a sentence that says what is taken. Null is nothing sent, as is an empty list
    that may be left out. A number or a yes or no written as text is read, and limit, page and steps are brought into
    range. An object that takes a seed is a palette: its seed or its address may stand for it, and an address brings
    its view. */
export function readArgs(
  schema: Record<string, unknown>,
  args: unknown
): { args: Record<string, unknown> } | { error: string } {
  try {
    return { args: read(schema as Schema, args ?? {}, "") as Record<string, unknown> };
  } catch (error) {
    if (error instanceof Refused) return { error: error.message };
    throw error;
  }
}
