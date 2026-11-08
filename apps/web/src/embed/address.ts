/* What an effect's script reads from its own address, as the server reads the stylesheet of the same address
   (server/files/address.ts addressParams, palette-files.ts): the palette's name before `.js`, and the query with a key
   copied out of the tags' HTML as `amp;soft` read as `soft`, and of a repeated key the last. A script whose address was
   written from that text plays what the stylesheet painted, its angle, soft and grain with it. An effect's ground
   written in other words than hex (bg=navy, bg=rgb(0 0 0 / 50%)), the blob's or the strings' (engine/effect.ts
   EFFECT_KINDS' `ground`), the server answers at its hex by a redirect, which the browser follows for both files while
   the script's own address keeps the words: the script reads them as the server's reader does (server/pipeline.ts,
   engine/css-color.ts), a clear one kept for the strings, so its player keeps the ground the still has. */
import { decodePalette } from "@grabient/engine/codec.ts";
import {
  EFFECT_KINDS,
  type Effect,
  type EffectFinish,
  effectFinish,
  effectGround,
  isEffect,
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
    none, a clear color kept as `#00000000` where `clear` asks (engine/css-color.ts cssColorText). */
export type GroundReader = (text: string, clear?: boolean) => string | null | undefined;

/** What the script at `address` plays, or null where it names no palette or no effect; `ground` reads a ground written
    in other words than hex, as the server's redirect does (a ground it cannot read, as there, goes). */
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
  const style = query.get("style");
  const kind = isEffect(style) && EFFECT_KINDS[style].ground ? style : null;
  const words = kind ? query.get("bg") : null;
  if (kind && ground && words !== null && effectGround(kind, words) === null) {
    const hex = ground(words, EFFECT_KINDS[kind].ground === "designed");
    if (hex) query.set("bg", hex);
    else query.delete("bg");
  }
  const params = embedParams(query);
  const effect = parseEffect(params);
  if (!P || !effect) return null;
  const view = parseView(params);
  return { name, P, effect, angle: view.angle, finish: effectFinish(effect.kind, view) };
}
