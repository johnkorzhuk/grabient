import { type EffectKind, SHAPE_MAX } from "@grabient/engine/effect.ts";
import { t } from "@grabient/i18n";
import press from "@grabient/ui/ColorField.module.css";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import type { Element } from "solid-js";
import fields from "./EffectFields.module.css";
import type { PaletteEditor } from "./editor.ts";
import { FPS, SPEED, shapeOf } from "./effects.ts";
import { screenFps } from "./refresh.ts";

/* An effect's fields in the Appearance menu, where Steps and Angle stand for the gradients: the view's Angle, which
   turns the glass's ribs and lays the palette across the blobs (Auto, the palette's own, under 0), the effect's pace
   (0, Off, holds its first frame), its frames a second (60 unless set, up to what the screen shows), and its shape,
   a number with a press inside its box for another. Two to a row; an effect's own field (the blob's frost,
   BlobControls.tsx) stands beside the frames a second, and the shape then shares its row with the blob's ground, as
   the glass's shape does with its frames a second, where both show whole (EffectFields.module.css). */

const times = (v: number) => (v === 0 ? t("Off") : `${Number(v.toFixed(2))}×`);

export function EffectFields(props: { editor: PaletteEditor; kind: EffectKind; extra?: Element }) {
  const e = props.editor;
  const play = () => e.effects.settings(props.kind);
  const set = () => e.opened().set;
  /* the glass as designed is shape 0; the blob always has a number in the editor, its palette's own until another */
  const own = () => (props.kind === "blob" ? shapeOf(e.seed()) : 0);
  const shape = () => play().look.shape ?? own();
  return (
    <>
      <Scrub
        label={t("Angle")}
        min={-1}
        max={360}
        step={1}
        grain={1}
        def={90}
        fmt={v => (v < 0 ? t("Auto") : `${Math.round(v)}°`)}
        value={set().angle ? e.angle() : -1}
        onInput={v => (v < 0 ? e.letViewGo("angle") : e.setAngle(Math.round(v)))}
      />
      <Scrub
        label={t("Speed")}
        value={play().speed}
        min={SPEED.min}
        max={SPEED.max}
        step={0.1}
        grain={0.05}
        def={1}
        fmt={times}
        onInput={speed => e.effects.set(props.kind, { speed: speed < 0.05 ? 0 : speed })}
      />
      {/* the glass's frames a second share their row with its shape, as the blob's shape and ground do */}
      <div class={props.extra ? undefined : fields.pairs}>
        <Scrub
          label={t("FPS")}
          value={play().fps}
          min={FPS.min}
          max={Math.max(screenFps(), play().fps)}
          step={1}
          grain={1}
          def={FPS.default}
          fmt={x => String(Math.round(x))}
          onInput={fps => e.effects.set(props.kind, { fps: Math.round(fps) })}
        />
      </div>
      {props.extra}
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
    </>
  );
}
