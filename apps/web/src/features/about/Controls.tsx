import { sampleLCH } from "@grabient/engine/curve.ts";
import { type Axis, C_MAX, type Palette } from "@grabient/engine/palette.ts";
import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { keyRow } from "@grabient/ui/keymap.ts";
import { rowKeys, showKey } from "@grabient/ui/keys.ts";
import { Plot } from "@grabient/ui/Plot.tsx";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import { createSignal, Show } from "solid-js";
import styles from "./About.module.css";
import type { Figure } from "./figure.ts";

/* The editor's side in small, over a figure's palette: each axis as its numbers over its plot, and the row of actions.
   A number says what it is and no more: with nothing held lightness is the palette's start and end, chroma its peak,
   hue where it starts and how far it travels; held keyframes' are their own, or their average. The plot is the same
   numbers as a picture and its own control: a dot drags one keyframe, and with nothing held the line drags the whole
   palette. Numbers, formulas and the plots read left to right in every language. */

const f3 = (v: number) => v.toFixed(3);
const deg = (v: number) => `${Math.round(v)}°`;
const degSigned = (v: number) => {
  const r = Math.round(v);
  return `${r > 0 ? "+" : ""}${r}°`;
};
const wheel = (h: number) => ((h % 360) + 360) % 360;
/** A key's chord as the reader's keyboard shows it, for a tip. */
const keyOf = (id: string, at = 0) => showKey(rowKeys(keyRow(id)!)[at] ?? "");

/* the held keyframes' amount as one number: the average while several are held, and a change moves each by as much */
function heldAmount(f: Figure, key: "l" | "c") {
  const value = () => {
    const all = f.selection().map(i => f.anchors()[i]?.[key] ?? 0);
    return all.length ? all.reduce((sum, v) => sum + v, 0) / all.length : 0;
  };
  return {
    value,
    write: (v: number) => {
      const lead = f.selection()[0];
      if (lead !== undefined) f.nudge(lead, key, f.anchors()[lead][key] + (v - value()));
    }
  };
}

/** One axis: its numbers, then its plot. */
export function AxisRow(props: {
  figure: Figure;
  axis: Axis;
  height: number;
  /** Random's locks at the fields' ends: a figure with no Random has none */
  locks?: boolean;
}) {
  const f = props.figure;
  /* each number's lock, closed while Random keeps it; lightness's keeps both its ends and stands apart */
  const lock = (axis: "l" | "c" | "h") =>
    props.locks === false ? undefined : () => f.toggleLock(axis);
  const light = heldAmount(f, "l");
  const chroma = heldAmount(f, "c");
  let peak = 0;
  let hue = 0;
  /* a drag on the line with nothing held, from where it began */
  const whole = (by: number, step: number) => {
    if (props.axis === "l") f.shiftLightness(step);
    else if (props.axis === "c") f.setChromaPeak(Math.max(0, Math.min(C_MAX, peak + by)));
    else f.setHueStart(Math.round(wheel(hue + by)));
  };
  const name = () =>
    t(props.axis === "l" ? msg("Lightness") : props.axis === "c" ? msg("Chroma") : msg("Hue"));
  return (
    <div class={styles.axis}>
      <div class={styles.fields} dir="ltr">
        <Show when={props.axis === "l"}>
          <Show
            when={f.whole()}
            fallback={
              <span class={styles.field}>
                <Scrub
                  small
                  label={t(f.multi() ? msg("Lightness average") : msg("Lightness"))}
                  locked={f.locked("l")}
                  lockLabel={t("Lock lightness")}
                  unlockLabel={t("Unlock lightness")}
                  lockApart
                  onLock={lock("l")}
                  min={0}
                  max={1}
                  fmt={f3}
                  value={light.value()}
                  onInput={light.write}
                />
              </span>
            }
          >
            <span class={styles.field}>
              <Scrub
                small
                label={t("Lightness start")}
                min={0}
                max={1}
                fmt={f3}
                value={f.lEnds().start}
                onInput={v => f.setLEnds(v, f.lEnds().end)}
              />
            </span>
            <span class={styles.field}>
              <Scrub
                small
                label={t("Lightness end")}
                locked={f.locked("l")}
                lockLabel={t("Lock lightness")}
                unlockLabel={t("Unlock lightness")}
                lockApart
                onLock={lock("l")}
                min={0}
                max={1}
                fmt={f3}
                value={f.lEnds().end}
                onInput={v => f.setLEnds(f.lEnds().start, v)}
              />
            </span>
          </Show>
        </Show>
        <Show when={props.axis === "c"}>
          <span class={styles.field}>
            <Show
              when={f.whole()}
              fallback={
                <Scrub
                  small
                  label={t(f.multi() ? msg("Chroma average") : msg("Chroma"))}
                  locked={f.locked("c")}
                  lockLabel={t("Lock chroma")}
                  unlockLabel={t("Unlock chroma")}
                  onLock={lock("c")}
                  min={0}
                  max={C_MAX}
                  fmt={f3}
                  value={chroma.value()}
                  onInput={chroma.write}
                />
              }
            >
              <Scrub
                small
                label={t("Chroma")}
                locked={f.locked("c")}
                lockLabel={t("Lock chroma")}
                unlockLabel={t("Unlock chroma")}
                onLock={lock("c")}
                min={0}
                max={C_MAX}
                fmt={f3}
                value={f.chromaPeak()}
                onInput={f.setChromaPeak}
              />
            </Show>
          </span>
        </Show>
        <Show when={props.axis === "h"}>
          <span class={styles.field}>
            <Scrub
              small
              label={t("Hue")}
              locked={f.locked("h")}
              lockLabel={t("Lock hue")}
              unlockLabel={t("Unlock hue")}
              onLock={lock("h")}
              min={0}
              max={359}
              step={1}
              grain={1}
              fmt={deg}
              value={f.hueStart()}
              onInput={f.setHueStart}
            />
          </span>
          <span class={styles.field}>
            <Scrub
              small
              label={t("Travel")}
              min={f.travelRange().lo}
              max={f.travelRange().hi}
              step={1}
              grain={1}
              def={0}
              fmt={degSigned}
              value={f.travel()}
              onInput={f.setTravel}
            />
          </span>
        </Show>
      </div>
      <Plot
        palette={f.shown()}
        axis={props.axis}
        height={props.height}
        stops={f.anchorStops()}
        selection={f.selection()}
        onPick={f.pick}
        onSweep={f.sweep}
        onNudge={f.nudge}
        onWholeStart={() => {
          peak = f.chromaPeak();
          hue = f.hueStart();
        }}
        onWhole={whole}
        aria-label={name()}
      />
    </div>
  );
}

/* the lightness over the span Straighten acts on, as its press's own glyph: the wiggle at rest, the ramp under hover */
function Spark(props: { palette: Palette; a: number; b: number }) {
  const W = 18;
  const H = 12;
  const N = 18;
  const path = () => {
    const K = props.palette.anchors.length;
    const t0 = props.a / (K - 1);
    const t1 = props.b / (K - 1);
    return Array.from({ length: N }, (_, i) => {
      const u = i / (N - 1);
      const l = sampleLCH(props.palette, t0 + (t1 - t0) * u)[0];
      return `${i ? "L" : "M"}${(u * W).toFixed(1)},${(H - l * H).toFixed(1)}`;
    }).join("");
  };
  return (
    <svg class={styles.spark} width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <path
        d={path()}
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linejoin="round"
        stroke-linecap="round"
      />
    </svg>
  );
}

/** The actions: Random by name, then the changes in place, then the figure's own undo and redo. Resting on one paints
    what it would do. */
export function Actions(props: { figure: Figure }) {
  const f = props.figure;
  const [straightening, setStraightening] = createSignal(false);
  const off = () => {
    setStraightening(false);
    f.setPeek(null);
  };
  const peek = (e: PointerEvent, palette: () => Palette | null) => {
    if (e.pointerType !== "touch") f.setPeek(palette());
  };
  const live = () => (straightening() ? f.straightened() : f.palette());
  return (
    <fieldset class={styles.acts} aria-label={t("Actions")}>
      <span class={styles.lead}>
        <Button
          full
          disabled={!f.canRandom()}
          keep
          onClick={f.random}
          tip={`${t("Random")} · ${keyOf("random")}`}
        >
          <Icon name="dice" size={14} /> {t("Random")}
        </Button>
      </span>
      <span class={styles.kind}>
        <span
          class={styles.press}
          onPointerEnter={e => {
            if (e.pointerType === "touch") return;
            setStraightening(true);
            f.setPeek(f.straightened());
          }}
          onPointerLeave={off}
        >
          <Button
            icon
            disabled={!f.canStraighten()}
            keep
            aria-label={t("Straighten lightness")}
            tip={t("Straighten lightness")}
            onClick={() => {
              off();
              f.straighten();
            }}
          >
            <Spark palette={live()} a={f.straightenSpan().a} b={f.straightenSpan().b} />
          </Button>
        </span>
        <span class={styles.press} onPointerEnter={e => peek(e, f.reversed)} onPointerLeave={off}>
          <Button
            icon
            disabled={!f.canReverse()}
            keep
            aria-label={t("Reverse")}
            tip={`${t("Reverse")} · ${keyOf("reverse")}`}
            onClick={() => {
              off();
              f.reverse();
            }}
          >
            <Icon name="flip" size={14} />
          </Button>
        </span>
        <span class={styles.press} onPointerEnter={e => peek(e, f.inverted)} onPointerLeave={off}>
          <Button
            icon
            aria-label={t("Invert")}
            tip={`${t("Invert")} · ${keyOf("invert")}`}
            onClick={() => {
              off();
              f.invert();
            }}
          >
            <Icon name="contrast" size={14} />
          </Button>
        </span>
      </span>
      <span class={styles.kind}>
        <span
          class={styles.press}
          onPointerEnter={e => peek(e, f.undoPalette)}
          onPointerLeave={off}
        >
          <Button
            icon
            disabled={!f.canUndo()}
            keep
            aria-label={t("Undo", { $context: "edit" })}
            tip={`${t("Undo", { $context: "edit" })} · ${keyOf("undo", 0)}`}
            onClick={() => {
              off();
              f.undo();
            }}
          >
            <Icon name="undo" size={14} />
          </Button>
        </span>
        <span
          class={styles.press}
          onPointerEnter={e => peek(e, f.redoPalette)}
          onPointerLeave={off}
        >
          <Button
            icon
            disabled={!f.canRedo()}
            keep
            aria-label={t("Redo", { $context: "edit" })}
            tip={`${t("Redo", { $context: "edit" })} · ${keyOf("undo", 1)}`}
            onClick={() => {
              off();
              f.redo();
            }}
          >
            <Icon name="redo" size={14} />
          </Button>
        </span>
      </span>
    </fieldset>
  );
}
