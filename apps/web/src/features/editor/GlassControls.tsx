import type { EffectKind } from "@grabient/engine/effect.ts";
import { t } from "@grabient/i18n";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import type { PaletteEditor } from "./editor.ts";
import { FPS_MAX, SPEED } from "./effects.ts";

/* An effect's fields in the Appearance menu, where Steps and Angle stand for the gradients: the fluted glass keeps the
   view's Angle, which turns its ribs, then each effect's pace (0, Off, holds its first frame) and its frames a second
   (Auto, the screen's own, under 1). */

const times = (v: number) => (v === 0 ? t("Off") : `${Number(v.toFixed(2))}×`);

export function EffectFields(props: { editor: PaletteEditor; kind: EffectKind }) {
  const e = props.editor;
  const play = () => e.effects.settings(props.kind);
  const set = () => e.opened().set;
  return (
    <>
      {props.kind === "glass" && (
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
      )}
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
      <Scrub
        label={t("FPS")}
        value={play().fps ?? 0}
        min={0}
        max={FPS_MAX}
        step={1}
        grain={1}
        def={0}
        fmt={x => (x < 1 ? t("Auto") : String(Math.round(x)))}
        onInput={fps => e.effects.set(props.kind, { fps: fps < 1 ? null : Math.round(fps) })}
      />
    </>
  );
}
