import { toHex } from "@grabient/engine/color.ts";
import {
  blobShapeOf,
  EFFECT_FPS,
  EFFECT_KINDS,
  EFFECT_SPEED,
  type EffectKind,
  type EffectPlay,
  type EffectSteps,
  type EffectZoom,
  SHAPE_MAX
} from "@grabient/engine/effect.ts";
import { stringsDesignedGround } from "@grabient/engine/strings-ground.ts";
import { t } from "@grabient/i18n";
import press from "@grabient/ui/ColorField.module.css";
import { deviceReducesMotion, reducedMotion, setMotionChoice } from "@grabient/ui/motion.ts";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import { Switch } from "@grabient/ui/Switch.tsx";
import { createSignal, createUniqueId, type Element, Show } from "solid-js";
import fields from "./EffectFields.module.css";
import type { PaletteEditor } from "./editor.ts";
import { GroundField } from "./GroundField.tsx";
import { screenFps } from "./refresh.ts";

/* An effect's fields in the Appearance menu, where Steps and Angle stand for the gradients: an effect's own Steps
   where it takes them (EFFECT_KINDS' `steps`: the sandstone's bands, their range its own), the glass's Angle, the
   view's, which turns its ribs (Auto, the palette's own, under 0; the blob has none, its palette lying from left to
   right), the effect's pace (0, Off, holds its first frame), its frames a second (60 unless set, up to what the screen
   shows), and in the editor its shape, a number with a press inside its box for another, or, for an effect that takes
   a zoom in its shape's place (EFFECT_KINDS' `zoom`: the dimple's), its zoom, in a list's menu too. Two to a row: the
   glass's angle beside its pace, its frames a second beside its shape; the sandstone's steps beside its angle, its
   pace beside its frames a second, then its shape; the blob's pace beside its frames a second, then its frost
   (BlobControls.tsx) beside its shape, and its ground, each pair sharing a row where both show whole
   (EffectFields.module.css); the strings' as the glass's, then their ground (GroundField.tsx), their designed one
   where none is set; the dimple's as the glass's, its zoom in its shape's place. A list's menu sets the same fields
   for every card (features/list), so they read and write whatever holds them. Above them,
   while the site moves less, the reader's Reduce motion says why no pace moves anything, and turns it off. */

const times = (v: number) => (v === 0 ? t("Off") : `${Number(v.toFixed(2))}×`);

/** The site's Reduce motion beside the pace it holds still (ui/motion.ts, the same setting as Settings'): shown while
    it holds the effects still, while the device asks for less motion, and once the reader turns it here, so the row
    a press changed stays to change back. Off lets the whole site move, as Settings' Off does; on gives the device's
    choice back where the device asks for less motion, else turns it on. The pace and the frames a second stay
    editable under it: they go into the address and the code for readers who move. */
function MotionRow() {
  const id = createUniqueId();
  const [turned, setTurned] = createSignal(false);
  return (
    <Show when={reducedMotion() || deviceReducesMotion() || turned()}>
      <div class={fields.motion}>
        <span id={`${id}-label`} class={fields.motionLabel}>
          {t("Reduce motion")}
        </span>
        <span id={`${id}-line`} class={fields.motionLine}>
          {reducedMotion() ? t("Effects hold still.") : t("Effects play.")}
        </span>
        <Switch
          checked={reducedMotion()}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-line`}
          onChange={on => {
            setTurned(true);
            setMotionChoice(on ? (deviceReducesMotion() ? "system" : "reduce") : "full");
          }}
        />
      </div>
    </Show>
  );
}

/** An effect's own steps, where it takes them (EFFECT_KINDS' `steps`: the sandstone's bands), as the gradients' Steps
    field sets theirs: within its range, its designed number where its look names none. */
export function StepsField(props: {
  range: EffectSteps;
  steps: number | null;
  onSteps: (steps: number) => void;
}) {
  return (
    <Scrub
      label={t("Steps")}
      min={props.range.least}
      max={props.range.most}
      step={1}
      grain={1}
      def={props.range.designed}
      fmt={v => String(Math.round(v))}
      value={props.steps ?? props.range.designed}
      onInput={v => props.onSteps(Math.round(v))}
    />
  );
}

/** An effect's zoom, where it takes one (EFFECT_KINDS' `zoom`: the dimple's), in its shape's place: how much larger
    than designed its picture is drawn, within its range, its designed zoom where its look names none. */
export function ZoomField(props: {
  range: EffectZoom;
  zoom: number | null;
  onZoom: (zoom: number) => void;
}) {
  return (
    <div class={fields.pairs}>
      <Scrub
        label={t("Zoom")}
        min={props.range.least}
        max={props.range.most}
        step={0.1}
        grain={0.05}
        def={props.range.designed}
        fmt={v => `${Number(v.toFixed(2))}×`}
        value={props.zoom ?? props.range.designed}
        onInput={v => props.onZoom(Math.round(v * 100) / 100)}
      />
    </div>
  );
}

/** The fields every effect has: its own `steps` where it takes them (StepsField), the glass's angle (none without
    `onAngle`: the blob has none), its pace and its frames a second, then `extra`, and `dial`, the field that picks
    its design: the editor's shape, or an effect's zoom in its place (ZoomField). */
export function PlayFields(props: {
  steps?: Element;
  angle?: number | "auto";
  onAngle?: (angle: number | "auto") => void;
  play: EffectPlay;
  onPlay: (part: Partial<EffectPlay>) => void;
  extra?: Element;
  dial?: Element;
}) {
  return (
    <>
      <MotionRow />
      {props.steps}
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
      {/* the glass's frames a second share their row with its shape (the dimple's with its zoom), as the blob's frost
          does; beside its steps, an effect's pace and its frames a second share theirs */}
      <div class={props.extra || !props.dial || props.steps ? undefined : fields.pairs}>
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
      {props.dial}
    </>
  );
}

export function EffectFields(props: { editor: PaletteEditor; kind: EffectKind; extra?: Element }) {
  const e = props.editor;
  const play = () => e.effects.settings(props.kind);
  /* the glass as designed is shape 0; the blob always has a number in the editor, its palette's own until another */
  const own = () => (props.kind === "blob" ? blobShapeOf(e.seed()) : 0);
  const shape = () => play().look.shape ?? own();
  /* the effect's own steps, where it takes them: its look's, kept while another style shows */
  const range = () => EFFECT_KINDS[props.kind].steps;
  /* its zoom, where it takes one in its shape's place */
  const zoom = () => EFFECT_KINDS[props.kind].zoom;
  /* a ground whose none is the effect's designed one (the strings'), which the field's swatch shows; the blob's comes
     with its frost (BlobControls.tsx) */
  const grounded = () => EFFECT_KINDS[props.kind].ground === "designed";
  return (
    <>
      <PlayFields
        steps={
          range() ? (
            <StepsField
              range={range()!}
              steps={play().look.steps}
              onSteps={steps => e.effects.look(props.kind, { steps })}
            />
          ) : undefined
        }
        angle={e.opened().set.angle ? e.angle() : "auto"}
        onAngle={
          props.kind === "blob"
            ? undefined
            : v => (v === "auto" ? e.letViewGo("angle") : e.setAngle(v))
        }
        play={play()}
        onPlay={part => e.effects.set(props.kind, part)}
        extra={props.extra}
        dial={
          zoom() ? (
            <ZoomField
              range={zoom()!}
              zoom={play().look.zoom}
              onZoom={zoom => e.effects.look(props.kind, { zoom })}
            />
          ) : (
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
          )
        }
      />
      <Show when={grounded()}>
        <GroundField
          kind={props.kind}
          bg={play().look.bg}
          auto={toHex(stringsDesignedGround(e.palette()))}
          onBg={bg => e.effects.look(props.kind, { bg })}
        />
      </Show>
    </>
  );
}
