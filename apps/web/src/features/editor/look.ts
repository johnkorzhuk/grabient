/* A palette's look: an effect and its settings, or a view setting, as the palette's address writes them after its seed,
   which a save keeps (a like, a collection's palette). Its own module, for the pages that save palettes and the server,
   so the frame every page loads holds none of it. */
import type { Effect } from "@grabient/engine/effect.ts";
import { isStyle, type View } from "@grabient/engine/view.ts";
import { LOOK_MAX, readSeedPage, seedAddress } from "./address.ts";

/** A palette's look as its address writes it after its seed: its view and its effect in the canonical address's order,
    their defaults left out, and nothing else (no size, no locks, no selection). What a save keeps of how the palette
    was drawn (a like, a collection's item): any style, effect or view setting the address writes, with no store of
    its own for each. */
export function lookQuery(view: View, effect: Effect | null): string {
  const address = seedAddress({ seed: "k", view: { ...view, size: null }, effect });
  const at = address.indexOf("?");
  return at < 0 ? "" : address.slice(at + 1);
}

/** A look a save kept, read for its palette as the palette's own address reads it: its view and its effect, a blob's
    shape the palette's own suggestion where the look names none; null for a seed that is no palette. */
export function readLook(
  seed: string,
  query: string
): { view: View; effect: Effect | null } | null {
  const page = readSeedPage(seed, new URLSearchParams(query));
  return page ? { view: page.view, effect: page.effect ?? null } : null;
}

/** What a save keeps of a look sent with it: the look read for its palette as the palette's address reads it (a leading
    `?`, or a whole address, taken too), in the view the save keeps (its style, steps and angle, which a look never
    overrides), and written again as lookQuery writes it; null where that says no more than the view does, as a
    gradient's look does, and for anything that is no look, longer than LOOK_MAX, for a seed that is no palette or a
    view that is none. The server writes only this, never what was sent, and its reads give a kept look back through it
    too, beside the row's view, so a look always agrees with the view it is kept beside. It names no style or setting of
    its own: whatever the address reads, it keeps. */
export function keptLook(
  seed: string,
  sent: unknown,
  view: { style: string; steps: number; angle: number }
): string | null {
  if (typeof sent !== "string" || sent.length > LOOK_MAX || !isStyle(view.style)) return null;
  const read = readLook(seed, sent.slice(sent.indexOf("?") + 1));
  const plain = read && readLook(seed, "");
  if (!read || !plain) return null;
  const own = { style: view.style, steps: view.steps, angle: view.angle };
  const look = lookQuery({ ...read.view, ...own }, read.effect);
  return look === lookQuery({ ...plain.view, ...own }, null) ? null : look;
}

/** The look a save of a palette drawn in `view` keeps while it plays `effect`: what a heart or an Add to collection
    sends with the palette it saves, none where it says no more than the view (as keptLook keeps it, which the server
    reads it with again). */
export function savedLook(seed: string, view: View, effect: Effect | null): string | undefined {
  const plain = readLook(seed, "");
  const look = lookQuery(view, effect);
  const { style, steps, angle } = view;
  return plain && look !== lookQuery({ ...plain.view, style, steps, angle }, null)
    ? look
    : undefined;
}
