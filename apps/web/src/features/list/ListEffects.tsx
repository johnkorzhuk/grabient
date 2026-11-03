import type { Effect, VectorKind } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { Match, Switch } from "solid-js";
import { BlobArt } from "../editor/BlobArt.tsx";
import { loadBlob } from "../editor/blob-draw.ts";
import { FxArt } from "../editor/FxArt.tsx";
import { loadFx } from "../editor/fx-draw.ts";
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
  /* a picture a kind: each shown by a plain test, so none reads a kind its condition no longer holds as the list's
     effect turns */
  const fx = (kind: VectorKind) => (
    <FxArt
      kind={kind}
      palette={props.palette}
      angle={props.angle}
      shape={props.effect.look.shape}
    />
  );
  return (
    <Switch
      fallback={
        <GlassArt colors={glassColors(props.palette)} angle={props.angle} gpu={props.gpu} />
      }
    >
      <Match when={props.effect.kind === "blob"}>
        <BlobArt palette={props.palette} settings={props.effect} />
      </Match>
      <Match when={props.effect.kind === "silk"}>{fx("silk")}</Match>
      <Match when={props.effect.kind === "rosette"}>{fx("rosette")}</Match>
      <Match when={props.effect.kind === "papercut"}>{fx("papercut")}</Match>
    </Switch>
  );
}

/** Every effect's still code, asked for as the Appearance menu opens, so its tiles are painted as it shows. */
export function preloadStills(): void {
  void loadStill().catch(() => {});
  void loadBlob().catch(() => {});
  void loadFx().catch(() => {});
}
