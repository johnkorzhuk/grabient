/* What an effect's script reads from its own address, as the server reads the stylesheet of the same address
   (server/files/address.ts addressParams, palette-files.ts): the palette's name before `.js`, and the query with a key
   copied out of the tags' HTML as `amp;soft` read as `soft`, and of a repeated key the last. A script whose address was
   written from that text plays what the stylesheet painted, its angle, soft and grain with it. */
import { decodePalette } from "@grabient/engine/codec.ts";
import { type Effect, type EffectFinish, parseEffect } from "@grabient/engine/effect.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { finishOf, parseView } from "@grabient/engine/view.ts";

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

/** What the script at `address` plays, or null where it names no palette or no effect. */
export function embedAsk(address: URL): EmbedAsk | null {
  const file = address.pathname.slice(address.pathname.lastIndexOf("/") + 1);
  let name: string;
  try {
    name = decodeURIComponent(file.replace(/\.js$/, ""));
  } catch {
    return null;
  }
  const P = decodePalette(name);
  const params = embedParams(address.searchParams);
  const effect = parseEffect(params);
  if (!P || !effect) return null;
  const view = parseView(params);
  return { name, P, effect, angle: view.angle, finish: finishOf(view) };
}
