/* What an effect's script reads from its own address, as the server reads the stylesheet of the same address
   (server/files/address.ts addressParams, palette-files.ts): the palette's name before `.js`, and the query with a key
   copied out of the tags' HTML as `amp;soft` read as `soft`, and of a repeated key the last. A script whose address was
   written from that text plays what the stylesheet painted, its angle, soft and grain with it. A blob's ground written
   in other words than hex (bg=navy, bg=rgb(0 0 0 / 50%)) the server answers at its hex by a redirect, which the
   browser follows for both files while the script's own address keeps the words: the blob's script reads them with
   the server's reader (server/pipeline.ts, engine/css-color.ts), so its player keeps the ground the still has. */
import { decodePalette } from "@grabient/engine/codec.ts";
import {
  type Effect,
  type EffectFinish,
  effectFinish,
  groundHex,
  parseEffect
} from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { parseView } from "@grabient/engine/view.ts";

export interface EmbedAsk {
  /** the palette's name in the address, as the page names its stylesheet */
  name: string;
  P: Palette;
  effect: Effect;
  angle: number;
  finish: EffectFinish;
}

/** The query as the server reads every file's (addressParams). */
export function embedParams(query: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of query) params.set(key.startsWith("amp;") ? key.slice(4) : key, value);
  return params;
}

/** A ground's words as the hex the server redirects them to, `undefined` for words that are no color and null for
    none (engine/css-color.ts cssColorText). */
export type GroundReader = (text: string) => string | null | undefined;

/** What the script at `address` plays, or null where it names no palette or no effect; `ground` reads a blob's ground
    written in other words than hex, as the server's redirect does (a ground it cannot read, as there, goes). */
export function embedAsk(address: URL, ground?: GroundReader): EmbedAsk | null {
  const file = address.pathname.slice(address.pathname.lastIndexOf("/") + 1);
  let name: string;
  try {
    name = decodeURIComponent(file.replace(/\.js$/, ""));
  } catch {
    return null;
  }
  const P = decodePalette(name);
  const query = new URLSearchParams(address.searchParams);
  const words = query.get("style") === "blob" ? query.get("bg") : null;
  if (ground && words !== null && groundHex(words) === null) {
    const hex = ground(words);
    if (hex) query.set("bg", hex);
    else query.delete("bg");
  }
  const params = embedParams(query);
  const effect = parseEffect(params);
  if (!P || !effect) return null;
  const view = parseView(params);
  return { name, P, effect, angle: view.angle, finish: effectFinish(effect.kind, view) };
}
