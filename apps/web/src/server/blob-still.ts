/* The blob's still on a palette's page, drawn by the server, as the glass's is (glass-still.ts). The page's first
   screen (Boot.tsx) leaves an empty holder naming the still it shows (data-blob-still: the palette and the blob's look,
   all its first frame depends on); this writes the blob's first frame into the head as a style for that name: the one
   design fitted to whatever box holds it, a lone blob contained and a filling one covering, over the blob's own ground
   where it has one. A rule rather than markup in the holder, since the browser draws the first screen again as the
   page starts, and the editor's own holder (BlobLayer.tsx) takes the same rule: the still stands through both, and the
   player picks up from it without a seam. It loads with the first page that has a holder. */
import { blobStillBackground } from "@grabient/engine/blob.ts";
import { decodePalette } from "@grabient/engine/codec.ts";
import { readBlobStillKey } from "@grabient/engine/effect.ts";
import { BLOB_STILL_STYLE } from "../features/editor/blob-draw.ts";

const HOLDER = /<div[^>]*\sdata-blob-still="([^"]*)"/;

/** The page with the still of its holder's name in its head. */
export function blobStills(html: string): string {
  const key = HOLDER.exec(html)?.[1] ?? "";
  const named = readBlobStillKey(key);
  const P = named ? decodePalette(named.seed) : null;
  if (!named || !P) return html;
  const view = { speed: 1, fps: 0, still: true, ...named.look };
  const style = `<style id="${BLOB_STILL_STYLE}" data-key="${key}">[data-blob-still="${key}"]{background:${blobStillBackground(P, view)}}</style>`;
  const head = html.indexOf("</head>");
  return head < 0 ? html : html.slice(0, head) + style + html.slice(head);
}
