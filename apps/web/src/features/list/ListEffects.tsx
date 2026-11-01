import type { Effect, EffectLook, EffectPlay } from "@grabient/engine/effect.ts";
import { glassColors } from "@grabient/engine/glass-colors.ts";
import type { Palette } from "@grabient/engine/palette.ts";
import { type Element, Show } from "solid-js";
import { BlobArt } from "../editor/BlobArt.tsx";
import { BlobLook } from "../editor/BlobControls.tsx";
import { GlassArt } from "../editor/GlassArt.tsx";
import { PlayFields } from "../editor/GlassControls.tsx";

/* The effects in a list's Appearance menu (ListAppearance.tsx): each one's still painted with the page's first palette,
   for its tile and the header's swatch, and the fields that set it for every card, the editor's own read from and
   written to the list's view. They load as the menu opens or the list plays an effect, never with a list's start, and
   ask for both stills' code as they come, so the menu's tiles are painted as it opens. */
if (!import.meta.env.SSR) {
  void import("../editor/glass-draw.ts").then(m => m.loadStill()).catch(() => {});
  void import("../editor/blob-draw.ts").then(m => m.loadBlob()).catch(() => {});
}

/** An effect's still as a small picture filling its box, the palette in its own shape. */
export function EffectSwatch(props: { effect: Effect; palette: Palette; angle: number }) {
  return (
    <Show
      when={props.effect.kind === "blob"}
      fallback={<GlassArt colors={glassColors(props.palette)} angle={props.angle} />}
    >
      <BlobArt palette={props.palette} settings={props.effect} angle={props.angle} />
    </Show>
  );
}

/** The effect's fields for every card: the angle and how it plays, and the blob's frost and ground. */
export function EffectFields(props: {
  effect: Effect;
  angle: number | "auto";
  onAngle: (angle: number | "auto") => void;
  onEffect: (effect: Effect) => void;
}) {
  const play = (part: Partial<EffectPlay>) => props.onEffect({ ...props.effect, ...part });
  const look = (part: Partial<EffectLook>) =>
    props.onEffect({ ...props.effect, look: { ...props.effect.look, ...part } });
  const fields = (frost?: Element) => (
    <PlayFields
      angle={props.angle}
      onAngle={props.onAngle}
      play={props.effect}
      onPlay={play}
      extra={frost}
    />
  );
  return (
    <Show when={props.effect.kind === "blob"} fallback={fields()}>
      <BlobLook look={props.effect.look} onLook={look} fields={fields} />
    </Show>
  );
}
