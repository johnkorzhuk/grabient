import type { Effect, EffectLook, EffectPlay } from "@grabient/engine/effect.ts";
import { type Element, Show } from "solid-js";
import { BlobLook } from "../editor/BlobControls.tsx";
import { PlayFields } from "../editor/GlassControls.tsx";

/* The fields of a list's Appearance menu while an effect is chosen (ListAppearance.tsx): the editor's own, read from
   and written to the list's view. They load as they show, never with a list's start or its swatch. */

/** The effect's fields for every card: the glass's angle, how it plays, and the blob's frost and ground. */
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
      onAngle={props.effect.kind === "blob" ? undefined : props.onAngle}
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
