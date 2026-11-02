/* The blob's stills on a page, drawn by the server, as the glass's are (glass-still.ts). A palette's first screen
   (Boot.tsx) and a list's cards (EffectArt.tsx) leave empty holders naming the still each shows (data-blob-still: the
   palette and the blob's look, all its first frame depends on); this writes each name's first frame into
   the head as a style, the one design covering whatever box holds it, over the blob's own ground where it has one.
   Rules rather than markup in the holders, since the browser draws the page's elements again as it starts, and the
   editor's own holder (BlobLayer.tsx) and a card's (BlobArt.tsx) take the same rule: the still stands through both,
   and the player picks up from it without a seam. A still is about a kilobyte in the compressed page, so a page names
   as many as its first screen shows (stills.ts). It loads with the first page that has a holder. */
import { blobStillBackground } from "@grabient/engine/blob.ts";
import { decodePalette } from "@grabient/engine/codec.ts";
import { readBlobStillKey } from "@grabient/engine/effect.ts";
import { BLOB_STILL_STYLE } from "../features/editor/blob-draw.ts";
import { FIRST_SCREEN_STILLS, holderNames, intoHead } from "./stills.ts";

/** The page with the stills its holders name in its head, the names it paints on the style. */
export function blobStills(html: string): string {
  const rules: string[] = [];
  const painted: string[] = [];
  for (const key of holderNames(html, "data-blob-still")) {
    if (painted.length === FIRST_SCREEN_STILLS) break;
    const named = readBlobStillKey(key);
    const P = named ? decodePalette(named.seed) : null;
    if (!named || !P) continue;
    const view = { speed: 1, fps: 0, still: true, ...named.look };
    rules.push(`[data-blob-still="${key}"]{background:${blobStillBackground(P, view)}}`);
    painted.push(key);
  }
  return rules.length
    ? intoHead(
        html,
        `<style id="${BLOB_STILL_STYLE}" data-key="${painted.join(" ")}">${rules.join("")}</style>`
      )
    : html;
}
