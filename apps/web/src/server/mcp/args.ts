import { parseEffect } from "@grabient/engine/effect.ts";
import { parseView } from "@grabient/engine/view.ts";
import { keptLook } from "../../features/editor/address.ts";
import { resolvePalette } from "../files/resolve.ts";
import type { PaletteGiven } from "./cards.ts";

/* An account tool's arguments, read against its JSON schema before it runs. A value with a plain reading is read so (a
   number or a yes or no written as text, one value for a list, a style's plain name, a number past its range brought
   into it, text past its length cut) and one with none is left out where the call may leave it out, each said in a
   note the answer carries: a model's slip is answered and told, never refused, since every refusal is an error the
   app counts against the server. Only what a tool cannot do without is refused. A palette no seed or address reads is
   passed on as unknown, and the tool answers that nothing has that seed. The admins' tools read their own (tool.ts
   str, num, items, entryOf). */

/** A palette as a call names it: its seed or an old grabient.com id, or its address on any origin, in any language,
    with or without a file's ending, or its card's address. A seed names no view; an address names a whole one, as its
    page draws it: what its query leaves out is the default. An address that says more than its view brings its look
    (editor/address.ts's keptLook), and one that plays an effect names no gradient: the palette keeps the view it has,
    turned to the address's angle where it names one. Null when the text names no palette. */
export function paletteNamed(named: string): PaletteGiven | null {
  if (named.length > 400) return null;
  const bare = resolvePalette(named);
  if (bare) return { seed: bare.seed };
  let url: URL;
  try {
    url = new URL(named, "https://palette.invalid");
  } catch {
    return null;
  }
  // the palette's page and its files hold the seed in the path, its card (/api/og) in the query
  const last = (url.pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.[a-z0-9]+$/i, "");
  const found = resolvePalette(last) ?? resolvePalette(url.searchParams.get("seed") ?? "");
  if (!found) return null;
  const { style, steps, angle } = parseView(url.searchParams);
  const look = keptLook(found.seed, url.search, { style, steps, angle });
  const looked = look ? { look } : {};
  if (parseEffect(url.searchParams))
    return { seed: found.seed, ...(url.searchParams.has("angle") ? { angle } : {}), ...looked };
  return { seed: found.seed, style, steps, angle, ...looked };
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

// brought into range with no word, as the answer names what was used
const BROUGHT = ["limit", "page", "steps"];
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
class Refused extends Error {}
/** A palette a call named that no seed or address reads. */
class Unknown extends Error {}

/* What people and models write for an enum's values, read without case, spaces, hyphens or underscores: the styles by
   their plain names, the gallery's orders by their everyday ones. A word stands only for a value its schema takes. */
const SAID: Record<string, string> = {
  linear: "linearGradient",
  gradient: "linearGradient",
  radial: "radialGradient",
  angular: "angularGradient",
  conic: "angularGradient",
  conicgradient: "angularGradient",
  swatches: "linearSwatches",
  bands: "linearSwatches",
  stripes: "linearSwatches",
  conicswatches: "angularSwatches",
  new: "newest",
  latest: "newest",
  recent: "newest",
  trending: "rising",
  top: "popular",
  liked: "popular"
};
const plain = (word: string) => word.toLowerCase().replace(/[\s_-]+/g, "");

/** What a call sent, for a note to name. */
function sent(value: unknown): string {
  const said = Array.isArray(value)
    ? `a list of ${value.length}`
    : (JSON.stringify(value) ?? String(value));
  return said.length > 60 ? `${said.slice(0, 59)}…` : said;
}

/** What a schema takes, in a note's words. */
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

/** Text cut to `max` UTF-16 units, never inside a character. */
function cut(text: string, max: number): string {
  const head = text.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(head) ? head.slice(0, -1) : head;
}

/** One value read as its schema says. `name` is what a note calls it, with where it sits: "palette 2: steps". What was
    read otherwise than sent is said in `notes`. A value with no reading throws Refused, a palette no seed reads Unknown;
    the object or list that holds it leaves it out where it may, and says so. */
function read(s: Schema, value: unknown, name: string, notes: string[]): unknown {
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
    const strange: string[] = [];
    for (const [key, field] of Object.entries(given)) {
      const property = Object.hasOwn(properties, key) ? properties[key] : null;
      if (!property) {
        strange.push(key);
        continue;
      }
      // what an app sends for nothing: null, and an empty list where the list may be left out
      if (field == null) continue;
      if (Array.isArray(field) && !field.length && property.minItems && !required.includes(key))
        continue;
      try {
        out[key] = read(property, field, at + key, notes);
      } catch (error) {
        if (!(error instanceof Refused) || required.includes(key)) throw error;
        notes.push(`${error.message} It was left out.`);
      }
    }
    if (strange.length) {
      const one = strange.length === 1;
      notes.push(
        `${at}${strange.map(sent).join(", ")} ${one ? "is not a name" : "are not names"} this takes, so ${one ? "it was" : "they were"} left out: it takes ${Object.keys(properties).join(", ") || "none"}.`
      );
    }
    for (const key of required) {
      if (out[key] === undefined)
        throw new Refused(`${at}${key} is needed: ${properties[key]?.description}`);
    }
    if (!palette) return out;
    const named = paletteNamed(out.seed as string);
    if (!named) throw new Unknown(`${at}seed ${sent(out.seed)} is no palette's seed or address.`);
    // the view an address carries stands unless the call names the same field itself
    return { ...named, ...out, seed: named.seed };
  }
  if (s.type === "array") {
    // one value where a list is taken is a list of one
    let items = Array.isArray(value) ? value : [value];
    const max = s.maxItems ?? Number.POSITIVE_INFINITY;
    if (items.length > max) {
      notes.push(`${name} takes ${max} at most: the first ${max} of ${items.length} were read.`);
      items = items.slice(0, max);
    }
    const each = `${name.replace(/s$/, "")} `;
    const out: unknown[] = [];
    for (const [i, item] of items.entries()) {
      try {
        out.push(read(s.items ?? {}, item, `${each}${i + 1}`, notes));
      } catch (error) {
        if (!(error instanceof Refused || error instanceof Unknown)) throw error;
        notes.push(`${error.message} It was left out.`);
      }
    }
    return out;
  }
  if (s.type === "boolean") {
    const word = typeof value === "string" ? value.trim().toLowerCase() : value;
    if (word === true || word === "true" || word === "yes" || word === 1 || word === "1")
      return true;
    if (word === false || word === "false" || word === "no" || word === 0 || word === "0")
      return false;
    return wrong();
  }
  if (s.type === "integer" || s.type === "number") {
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && NUMBER.test(value.trim())
          ? Number(value)
          : Number.NaN;
    if (!Number.isFinite(n)) return wrong();
    const low = s.minimum ?? Number.NEGATIVE_INFINITY;
    const high = s.maximum ?? Number.POSITIVE_INFINITY;
    let used = s.type === "integer" ? Math.round(n) : n;
    const field = name.split(" ").pop() ?? "";
    // an angle a turn or more either way is the same angle
    if (field === "angle" && low === 0 && high === 360 && (used < 0 || used > 360))
      used = ((used % 360) + 360) % 360;
    used = Math.max(low, Math.min(high, used));
    if (used !== n && !BROUGHT.includes(field))
      notes.push(`${name} is ${takes(s)}: ${sent(value)} was read as ${used}.`);
    return used;
  }
  const typed =
    typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : null;
  if (typed === null) return wrong();
  const text = typed.normalize("NFC").trim();
  if (s.enum) {
    if (s.enum.includes(text)) return text;
    const key = plain(text);
    const meant = s.enum.find(option => plain(option) === key) ?? SAID[key];
    if (!meant || !s.enum.includes(meant)) return wrong();
    if (plain(meant) !== key) notes.push(`${name} ${sent(value)} was read as ${meant}.`);
    return meant;
  }
  if (s.maxLength !== undefined && text.length > s.maxLength) {
    notes.push(
      `${name} takes ${s.maxLength} characters at most: the first ${s.maxLength} were read.`
    );
    return cut(text, s.maxLength).trim();
  }
  return text;
}

/** What reading a call's arguments came to: the arguments and what was said of them; what the tool cannot do without,
    refused in a sentence that says what is taken; or a palette it needs that no seed or address reads. */
export type ArgsRead =
  | { args: Record<string, unknown>; notes: string[] }
  | { error: string }
  | { unknown: string };

/** A call's arguments read as its tool's schema says (read above). Null is nothing sent, as is an empty list that may be
    left out. An object that takes a seed is a palette: its seed or its address may stand for it, and an address brings
    its view; one in a list that no seed reads is left out of the list, and said so. */
export function readArgs(schema: Record<string, unknown>, args: unknown): ArgsRead {
  const notes: string[] = [];
  try {
    return {
      args: read(schema as Schema, args ?? {}, "", notes) as Record<string, unknown>,
      notes
    };
  } catch (error) {
    if (error instanceof Refused) return { error: error.message };
    if (error instanceof Unknown) return { unknown: error.message };
    throw error;
  }
}
