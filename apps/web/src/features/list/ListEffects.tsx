import type { Effect } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { Show } from "solid-js";
import { BlobArt } from "../editor/BlobArt.tsx";
import { loadBlob } from "../editor/blob-draw.ts";
import { GlassArt } from "../editor/GlassArt.tsx";
import { loadStill } from "../editor/glass-draw.ts";

/* An effect's still on a list: the header's swatch, the Appearance menu's tiles and a searched palette's thumbnail.
   It loads with the menu or an effect a list plays, never with a list's start; each picture asks for its own still's
   code as it shows, so a list that plays one effect loads nothing of the other's. */

/** An effect's still as a small picture filling its box, the palette in its own shape. */
export function EffectSwatch(props: {
  effect: Effect;
  palette: Palette;
  angle: number;
  /** false draws the glass's still as its SVG: no WebGL context where the page plays no glass */
  gpu?: boolean;
}) {
  return (
    <Show
      when={props.effect.kind === "blob"}
      fallback={
        <GlassArt colors={glassColors(props.palette)} angle={props.angle} gpu={props.gpu} />
      }
    >
      <BlobArt palette={props.palette} settings={props.effect} />
    </Show>
  );
}

/** Both effects' still code, asked for as the Appearance menu opens, so its tiles are painted as it shows. */
export function preloadStills(): void {
  void loadStill().catch(() => {});
  void loadBlob().catch(() => {});
}
