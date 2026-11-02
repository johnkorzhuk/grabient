import {
  blobShapeOf,
  EFFECT_FPS,
  EFFECT_SPEED,
  type EffectKind,
  type EffectPlay,
  SHAPE_MAX
} from "@grabient/engine/effect.ts";
import { t } from "@grabient/i18n";
import press from "@grabient/ui/ColorField.module.css";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import { type Element, Show } from "solid-js";
import fields from "./EffectFields.module.css";
import type { PaletteEditor } from "./editor.ts";
import { screenFps } from "./refresh.ts";

/* An effect's fields in the Appearance menu, where Steps and Angle stand for the gradients: the glass's Angle, the
   view's, which turns its ribs (Auto, the palette's own, under 0; the blob has none, its palette lying from left to
   right), the effect's pace (0, Off, holds its first frame), its frames a second (60 unless set, up to what the screen
   shows), and in the editor its shape, a number with a press inside its box for another. Two to a row: the glass's
   angle beside its pace, its frames a second beside its shape; the blob's pace beside its frames a second, then its
   frost (BlobControls.tsx) beside its shape, and its ground, each pair sharing a row where both show whole
   (EffectFields.module.css). A list's menu sets the same fields for every card (features/list), so they read and
   write whatever holds them. */

const times = (v: number) => (v === 0 ? t("Off") : `${Number(v.toFixed(2))}×`);

/** The fields every effect has: the glass's angle (none without `onAngle`: the blob has none), its pace and its
    frames a second, then `extra`, and the editor's `shape`. */
export function PlayFields(props: {
  angle?: number | "auto";
  onAngle?: (angle: number | "auto") => void;
  play: EffectPlay;
  onPlay: (part: Partial<EffectPlay>) => void;
  extra?: Element;
  shape?: Element;
}) {
  return (
    <>
      <Show when={props.onAngle}>
        <Scrub
          label={t("Angle")}
          min={-1}
          max={360}
          step={1}
          grain={1}
          def={90}
          fmt={v => (v < 0 ? t("Auto") : `${Math.round(v)}°`)}
          value={props.angle === undefined || props.angle === "auto" ? -1 : props.angle}
          onInput={v => props.onAngle?.(v < 0 ? "auto" : Math.round(v))}
        />
      </Show>
      <Scrub
        label={t("Speed")}
        value={props.play.speed}
        min={EFFECT_SPEED.min}
        max={EFFECT_SPEED.max}
        step={0.1}
        grain={0.05}
        def={1}
        fmt={times}
        onInput={speed => props.onPlay({ speed: speed < 0.05 ? 0 : speed })}
      />
      {/* the glass's frames a second share their row with its shape, as the blob's frost does */}
      <div class={props.extra || !props.shape ? undefined : fields.pairs}>
        <Scrub
          label={t("FPS")}
          value={props.play.fps}
          min={EFFECT_FPS.min}
          max={Math.max(screenFps(), props.play.fps)}
          step={1}
          grain={1}
          def={EFFECT_FPS.default}
          fmt={x => String(Math.round(x))}
          onInput={fps => props.onPlay({ fps: Math.round(fps) })}
        />
      </div>
      {props.extra}
      {props.shape}
    </>
  );
}

export function EffectFields(props: { editor: PaletteEditor; kind: EffectKind; extra?: Element }) {
  const e = props.editor;
  const play = () => e.effects.settings(props.kind);
  /* the glass as designed is shape 0; the blob always has a number in the editor, its palette's own until another */
  const own = () => (props.kind === "blob" ? blobShapeOf(e.seed()) : 0);
  const shape = () => play().look.shape ?? own();
  return (
    <PlayFields
      angle={e.opened().set.angle ? e.angle() : "auto"}
      onAngle={
        props.kind === "blob"
          ? undefined
          : v => (v === "auto" ? e.letViewGo("angle") : e.setAngle(v))
      }
      play={play()}
      onPlay={part => e.effects.set(props.kind, part)}
      extra={props.extra}
      shape={
        <div class={fields.pairs}>
          <Scrub
            label={t("Shape")}
            value={shape()}
            min={0}
            max={SHAPE_MAX}
            step={1}
            grain={1}
            def={own()}
            fmt={x => String(Math.round(x))}
            onInput={value => e.effects.look(props.kind, { shape: Math.round(value) })}
            action={{
              icon: "dice",
              label: t("New shape"),
              onPress: () => e.effects.shuffle(props.kind),
              class: press.press
            }}
          />
        </div>
      }
    />
  );
}
