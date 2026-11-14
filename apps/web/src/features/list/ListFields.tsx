import {
  canRoam,
  EFFECT_KINDS,
  type Effect,
  type EffectLook,
  type EffectPlay
} from "@grabient/engine/effect.ts";
import { type Element, Show } from "solid-js";
import { BlobLook } from "../editor/BlobControls.tsx";
import { PlayFields, StepsField, ZoomField } from "../editor/GlassControls.tsx";
import { GroundField } from "../editor/GroundField.tsx";

/* The fields of a list's Appearance menu while an effect is chosen (ListAppearance.tsx): the editor's own, read from
   and written to the list's view. They load as they show, never with a list's start or its swatch. */

/** The effect's fields for every card: the sandstone's steps, the glass's angle, how it plays, the dimple's zoom, the
    blob's frost and ground, the strings' ground, none their designed one, each card's own palette's (so the field's
    swatch shows none), and the aurora's range's, none clear. No shape and no path: each card plays its own palette's
    shape behind the designed range, and the editor alone picks them (John, 14 Nov 2026: "hide the shape options for
    aurora on the list routes. it should only be for the editor"). */
export function EffectFields(props: {
  effect: Effect;
  angle: number | "auto";
  onAngle: (angle: number | "auto") => void;
  onEffect: (effect: Effect) => void;
}) {
  const play = (part: Partial<EffectPlay>) => props.onEffect({ ...props.effect, ...part });
  const look = (part: Partial<EffectLook>) =>
    props.onEffect({ ...props.effect, look: { ...props.effect.look, ...part } });
  const range = () => EFFECT_KINDS[props.effect.kind].steps;
  const zoom = () => EFFECT_KINDS[props.effect.kind].zoom;
  const fields = (frost?: Element) => (
    <PlayFields
      roams={canRoam(props.effect.kind)}
      steps={
        range() ? (
          <StepsField
            range={range()!}
            steps={props.effect.look.steps}
            onSteps={steps => look({ steps })}
          />
        ) : undefined
      }
      angle={props.angle}
      onAngle={props.effect.kind === "blob" ? undefined : props.onAngle}
      play={props.effect}
      onPlay={play}
      extra={frost}
      dial={
        zoom() ? (
          <ZoomField
            range={zoom()!}
            zoom={props.effect.look.zoom}
            onZoom={zoom => look({ zoom })}
          />
        ) : undefined
      }
    />
  );
  /* a ground with a field of its own here: the strings' and the aurora's range's; the blob's comes with its frost */
  const grounded = () =>
    props.effect.kind !== "blob" && EFFECT_KINDS[props.effect.kind].ground !== null;
  return (
    <Show
      when={props.effect.kind === "blob"}
      fallback={
        <>
          {fields()}
          <Show when={grounded()}>
            <GroundField
              kind={props.effect.kind}
              bg={props.effect.look.bg}
              onBg={bg => look({ bg })}
            />
          </Show>
        </>
      }
    >
      <BlobLook look={props.effect.look} onLook={look} fields={fields} />
    </Show>
  );
}
