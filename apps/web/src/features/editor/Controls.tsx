import { type Axis, C_MAX, type Palette } from "@grabient/engine";
import { sampleLCH } from "@grabient/engine/curve.ts";
import { HUE_WHEEL_MAX, type Lock } from "@grabient/engine/edits.ts";
import { onWheel } from "@grabient/engine/math.ts";
import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Plot } from "@grabient/ui/Plot.tsx";
import { Scrub } from "@grabient/ui/Scrub.tsx";
import { tooltip } from "@grabient/ui/Tooltip.tsx";
import { createSignal, type Element, flush, onSettled, Show } from "solid-js";
import styles from "./Controls.module.css";
import type { PaletteEditor } from "./editor.ts";
import { keyOf } from "./keys.ts";
import type { PaletteSave } from "./save.ts";

/* The side's controls over the palette: each axis as its numbers over its plot, then the row of actions. A number is a
   field with its name inside, and the name says what the number is: which keyframes are held is the chips' to say.
   With nothing held lightness is the palette's two ends, chroma its peak, hue where it starts and how far it travels;
   one held keyframe's numbers are its own; several held keyframes' lightness and chroma are their means. */

const f3 = (v: number) => v.toFixed(3);
const degrees = (v: number) => `${Math.round(v)}°`;
const signed = (v: number) => {
  const r = Math.round(v) || 0;
  return `${r > 0 ? "+" : ""}${r}°`;
};

/* A line of two fields gives way where it cannot hold both: lightness's names shorten, End first, and hue's fields
   stand one under the other. A field is too narrow when its number runs past its box; the line is read when its width
   changes, never as a number does, so nothing moves under a drag. */
function fitting(line: () => HTMLElement, steps: number) {
  const [tight, setTight] = createSignal(0);
  onSettled(() => {
    const el = line();
    const cut = () =>
      [...el.querySelectorAll("input")].some(input => input.scrollWidth > input.clientWidth + 1);
    /* fields standing one under another change the line's height, never its width: only a new width is read */
    let width = -1;
    let frame = 0;
    const read = () => {
      frame = 0;
      width = el.clientWidth;
      let next = 0;
      setTight(0);
      flush();
      while (next < steps && cut()) {
        setTight(++next);
        flush();
      }
    };
    const sizes = new ResizeObserver(() => {
      if (el.clientWidth !== width && !frame) frame = requestAnimationFrame(read);
    });
    sizes.observe(el);
    void document.fonts.ready.then(() => {
      if (el.isConnected) read();
    });
    return () => {
      sizes.disconnect();
      cancelAnimationFrame(frame);
    };
  });
  return tight;
}

export function AxisRow(props: { editor: PaletteEditor; axis: Axis; height: number }) {
  const e = props.editor;
  let line!: HTMLDivElement;
  const tight = fitting(() => line, props.axis === "h" ? 1 : 2);
  const lock = (k: Lock) => () => e.toggleLock(k);
  const lead = () => e.palette().anchors[e.lead()] ?? e.palette().anchors[0];
  /* a drag on the line with nothing held: lightness end to end by as much, chroma's peak, or hue round the wheel, each
     from where the drag began */
  let peak = 0;
  let hue = 0;
  const whole = (by: number, step: number) => {
    if (props.axis === "l") e.shiftLightness(step);
    else if (props.axis === "c") e.setChromaPeak(Math.max(0, Math.min(C_MAX, peak + by)));
    else e.setHueStart(Math.round(onWheel(hue + by)));
  };
  const name = () =>
    t(props.axis === "l" ? msg("Lightness") : props.axis === "c" ? msg("Chroma") : msg("Hue"));
  return (
    <div class={styles.axis}>
      <div
        ref={line}
        class={styles.fields}
        data-stacked={props.axis === "h" && tight() ? "" : undefined}
        dir="ltr"
      >
        <Show when={props.axis === "l"}>
          <Show
            when={e.whole()}
            fallback={
              <Scrub
                small
                label={t(e.multi() ? msg("Lightness average") : msg("Lightness"))}
                locked={e.locked("l")}
                lockLabel={t("Lock lightness")}
                unlockLabel={t("Unlock lightness")}
                lockApart
                onLock={lock("l")}
                min={0}
                max={1}
                fmt={f3}
                value={e.heldMean("l")}
                onInput={v => e.setHeldMean("l", v)}
              />
            }
          >
            <Scrub
              small
              label={t(tight() > 1 ? msg("Start") : msg("Lightness start"))}
              min={0}
              max={1}
              fmt={f3}
              value={e.lightnessEnds().start}
              onInput={v => e.setLightnessEnds(v, e.lightnessEnds().end)}
            />
            <Scrub
              small
              label={t(tight() ? msg("End") : msg("Lightness end"))}
              locked={e.locked("l")}
              lockLabel={t("Lock lightness")}
              unlockLabel={t("Unlock lightness")}
              lockApart
              onLock={lock("l")}
              min={0}
              max={1}
              fmt={f3}
              value={e.lightnessEnds().end}
              onInput={v => e.setLightnessEnds(e.lightnessEnds().start, v)}
            />
          </Show>
        </Show>
        <Show when={props.axis === "c"}>
          <Scrub
            small
            label={t(e.whole() || !e.multi() ? msg("Chroma") : msg("Chroma average"))}
            locked={e.locked("c")}
            lockLabel={t("Lock chroma")}
            unlockLabel={t("Unlock chroma")}
            onLock={lock("c")}
            min={0}
            max={C_MAX}
            fmt={f3}
            value={e.whole() ? e.chromaPeak() : e.heldMean("c")}
            onInput={v => (e.whole() ? e.setChromaPeak(v) : e.setHeldMean("c", v))}
          />
        </Show>
        <Show when={props.axis === "h"}>
          <Scrub
            small
            label={t("Hue")}
            locked={e.locked("h")}
            lockLabel={t("Lock hue")}
            unlockLabel={t("Unlock hue")}
            onLock={lock("h")}
            min={0}
            max={HUE_WHEEL_MAX}
            step={1}
            grain={1}
            fmt={degrees}
            value={e.whole() ? e.hueStart() : onWheel(lead().h)}
            onInput={v => (e.whole() ? e.setHueStart(v) : e.setHeldHue(v))}
          />
          <Travel editor={e} />
        </Show>
      </div>
      <Plot
        palette={e.shownPalette()}
        wide={e.wide()}
        axis={props.axis}
        height={props.height}
        stops={e.keyframes()}
        selection={e.held()}
        onPick={e.pick}
        onSweep={e.sweep}
        onNudge={(i, axis, v, from) => e.nudge(i, axis, v, from)}
        onWholeStart={() => {
          peak = e.chromaPeak();
          hue = e.hueStart();
        }}
        onWhole={whole}
        reading={e.reading()}
        onHover={e.setReading}
        aria-label={name()}
      />
    </div>
  );
}

/** How far the hue turns: the whole palette's, or the held keyframes' span. The last keyframe alone has no stretch
    after it to turn over: its field stands dimmed and says why under the pointer. */
function Travel(props: { editor: PaletteEditor }) {
  const e = props.editor;
  const tip = tooltip(() => (e.whole() || e.travelSpan() ? "" : t("No next keyframe")));
  const range = () => (e.whole() ? e.travelRange() : e.travelSpan() ? e.spanTravelRange() : null);
  return (
    <span ref={tip} class={styles.field}>
      <Scrub
        small
        label={t("Travel")}
        min={range()?.lo ?? -1}
        max={range()?.hi ?? 1}
        step={1}
        grain={1}
        def={0}
        fmt={signed}
        muted={!range()}
        value={e.whole() ? e.travel() : e.spanTravel()}
        onInput={v => (e.whole() ? e.setTravel(v) : e.setSpanTravel(v))}
      />
    </span>
  );
}

/* the lightness over the span Straighten acts on, as its press's glyph: the wiggle at rest, the line under the pointer */
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
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
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

/** A press of the row whose result is painted while a mouse rests on it. A finger never rests. */
function Previewed(props: {
  show: () => Palette | null;
  editor: PaletteEditor;
  children: Element;
}) {
  return (
    <span
      class={styles.cell}
      onPointerEnter={event => {
        if (event.pointerType !== "touch") props.editor.setPeek(props.show());
      }}
      onPointerLeave={() => props.editor.setPeek(null)}
    >
      {props.children}
    </span>
  );
}

export function Actions(props: { editor: PaletteEditor; save: PaletteSave }) {
  const e = props.editor;
  const [straight, setStraight] = createSignal(false);
  const span = () => e.straightenSpan();
  const save = props.save;
  /* a tooltip names a press, then its key after a middle dot: a key is never translated */
  const named = (name: string, key: string) => (key ? `${name} · ${key}` : name);
  return (
    /* biome-ignore lint/a11y/useSemanticElements: a row of presses named as one, which a fieldset would box */
    <div class={styles.actions} role="group" aria-label={t("Actions")}>
      <span class={styles.lead}>
        <Button
          full
          disabled={!e.canRandom()}
          keep
          onClick={() => e.random()}
          tip={named(t("Random"), keyOf("random"))}
        >
          <Icon name="dice" size={14} /> {t("Random")}
        </Button>
      </span>
      <span class={styles.kind}>
        <span
          class={styles.cell}
          onPointerEnter={event => {
            if (event.pointerType === "touch") return;
            setStraight(true);
            e.setPeek(e.straightened());
          }}
          onPointerLeave={() => {
            setStraight(false);
            e.setPeek(null);
          }}
        >
          <Button
            icon
            disabled={!e.canStraighten()}
            keep
            aria-label={t("Straighten lightness")}
            tip={t("Straighten lightness")}
            onClick={() => {
              setStraight(false);
              e.setPeek(null);
              e.straighten();
            }}
          >
            <Spark
              palette={straight() ? e.straightened() : e.palette()}
              a={Math.max(0, span().a)}
              b={Math.min(e.K() - 1, span().b)}
            />
          </Button>
        </span>
        <Previewed editor={e} show={() => (e.canReverse() ? e.reversed() : null)}>
          <Button
            icon
            disabled={!e.canReverse()}
            keep
            aria-label={t("Reverse")}
            tip={named(t("Reverse"), keyOf("reverse"))}
            onClick={() => {
              e.setPeek(null);
              e.reverse();
            }}
          >
            <Icon name="flip" size={14} />
          </Button>
        </Previewed>
        <Previewed editor={e} show={e.inverted}>
          <Button
            icon
            aria-label={t("Invert")}
            tip={named(t("Invert"), keyOf("invert"))}
            onClick={() => {
              e.setPeek(null);
              e.invert();
            }}
          >
            <Icon name="contrast" size={14} />
          </Button>
        </Previewed>
      </span>
      {/* the editor's own undo: it walks this palette's edits and the page's steps, and never leaves the page */}
      <span class={styles.kind}>
        <Previewed editor={e} show={e.undoValue}>
          <Button
            icon
            disabled={!e.canUndo()}
            keep
            aria-label={t("Undo", { $context: "edit" })}
            tip={named(t("Undo", { $context: "edit" }), keyOf("undo", 0))}
            onClick={() => {
              e.setPeek(null);
              e.undo();
            }}
          >
            <Icon name="undo" size={14} />
          </Button>
        </Previewed>
        <Previewed editor={e} show={e.redoValue}>
          <Button
            icon
            disabled={!e.canRedo()}
            keep
            aria-label={t("Redo", { $context: "edit" })}
            tip={named(t("Redo", { $context: "edit" }), keyOf("undo", 1))}
            onClick={() => {
              e.setPeek(null);
              e.redo();
            }}
          >
            <Icon name="redo" size={14} />
          </Button>
        </Previewed>
      </span>
      {/* an admin's Save: the palette on screen in the place of the one this page opened, wherever that stands */}
      <Show when={save.admin()}>
        <span
          class={[styles.cell, styles.whole]}
          ref={tooltip(() => (save.can() ? "" : save.reason() || save.tip()))}
        >
          <Button
            full
            wrap
            disabled={!save.can()}
            keep
            tip={save.tip()}
            onClick={() => void save.save()}
          >
            <Icon name={save.done() ? "check" : "save"} size={14} />{" "}
            {save.saving() ? t("Saving…") : save.done() ? t("Saved") : t("Save")}
          </Button>
        </span>
      </Show>
    </div>
  );
}
