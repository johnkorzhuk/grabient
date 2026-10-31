import { fitChroma, lchToSrgbBytes } from "@grabient/engine/color.ts";
import { sampleLCH } from "@grabient/engine/curve.ts";
import type { Axis, Palette } from "@grabient/engine/palette.ts";
import {
  type CurveData,
  type CurveSample,
  curveData,
  HUE_MIN_C,
  yC,
  yH,
  yL
} from "@grabient/engine/plot.ts";
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onSettled,
  Show
} from "solid-js";
import { type PickMode, pickModeOf } from "./Keyframes.tsx";
import { watchSize } from "./measure.ts";
import styles from "./Plot.module.css";
import { SLOP } from "./press.ts";

/* One axis of a palette as a plot that is its own control: ink on paper, and under the line of an amount (lightness,
   chroma) a wash of color that thins toward the floor. A keyframe's dot is a thumb in its own color that drags up and
   down. With nothing held the line is the whole palette's, and a drag on it moves every keyframe together. A press
   anywhere else holds the keyframe nearest along the palette, and one that goes on across the plot holds the run it
   sweeps, as a press along the chips does. Where the screen cannot show the chroma a keyframe asks for, a dotted line
   draws what is asked over what is shown. Hue is no amount, so it is a line in the palette's own colors. The wash is
   true to the axis: across, the palette's color there; up, the value that height means, so under lightness a color
   darkens to black at the floor and under chroma it grays. Left to right in every language, as the palette runs. */

/* the ground stands this far in from the plot's top and foot, where the scale's numbers are */
const PAD = 12;
const DOT = 6.5;
/* the wash is smooth, so it is painted this small and drawn to size; how strong it is at the top and at the floor */
const COLS = 96;
const ROWS = 48;
const WASH_TOP = 0.5;
const WASH_FLOOR = 0.06;
/* how near a press must come to a dot, and to the line, in CSS px */
const DOT_REACH = 16;
const LINE_REACH = 10;

interface Scale {
  cTop: number;
  hLo: number;
  hHi: number;
}

export interface PlotProps {
  palette: Palette;
  /** the screen shows Display-P3 */
  wide?: boolean;
  axis: Axis;
  /** in CSS px */
  height: number;
  /** the keyframes' colors as the screen draws them: each dot's paint */
  stops: readonly { hex: string; paint?: string }[];
  /** the keyframes held; none held, the line is the whole palette's */
  selection: readonly number[];
  /** a press on a dot or in a keyframe's column: how it holds it, as a chip's press would */
  onPick: (i: number, mode: PickMode) => void;
  /** a keyframe dragged to a value on this axis, from the palette the drag began on */
  onNudge: (i: number, axis: Axis, value: number, from: Palette) => void;
  /** a dot dragged to a new value and let go, or a press the page took for a scroll or a pinch's zoom: the keyframes
      held before it, to hold again */
  onRestore?: (selection: readonly number[]) => void;
  /** nothing held, a drag on the line moves the whole palette along the axis: it begins, then how far it has gone in
      the axis's units, since it began and since the move before */
  onWholeStart?: () => void;
  onWhole?: (by: number, step: number) => void;
  /** a press that goes on across the plot: the run from the keyframe it began at to the one it has reached */
  onSweep?: (from: number, to: number) => void;
  /** where along the palette the page is being read, 0 to 1, by this plot or another picture of it */
  reading?: number | null;
  onHover?: (t: number | null) => void;
  "aria-label": string;
}

const line = (points: readonly [number, number][]) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");

export function Plot(props: PlotProps) {
  const id = createUniqueId();
  let host!: HTMLDivElement;
  let svg!: SVGSVGElement;
  let wash!: HTMLCanvasElement;
  const [width, setWidth] = createSignal(480);
  const data = createMemo<CurveData>(() => curveData(props.palette, 96, !!props.wide));
  /* the scale a drag began on stands until it ends, so the dot stays under the pointer */
  const [frozen, setFrozen] = createSignal<Scale | null>(null);
  const scale = () => frozen() ?? data();
  const inner = () => props.height - 2 * PAD;
  const x = (t: number) => t * width();
  const yOf = (v: number) => {
    const s = scale();
    return (
      PAD +
      (props.axis === "l"
        ? yL(v, inner())
        : props.axis === "c"
          ? yC(Math.min(v, s.cTop), s.cTop, inner())
          : yH(v, s.hLo, s.hHi, inner()))
    );
  };
  const k = () => (props.axis === "l" ? 0 : props.axis === "c" ? 1 : 2);
  const outOf = (s: CurveSample) => s.out[k()];
  const path = () => line(data().samples.map(s => [x(s.t), yOf(outOf(s))]));
  const askPath = () => line(data().samples.map(s => [x(s.t), yOf(s.ask[1])]));
  const segment = (run: [number, number]) =>
    line(
      data()
        .samples.slice(run[0], run[1])
        .map(s => [x(s.t), yOf(s.out[2])])
    );
  const top = () =>
    props.axis === "l" ? "1" : props.axis === "c" ? scale().cTop.toFixed(2) : `${scale().hHi}°`;
  const foot = () => (props.axis === "h" ? `${scale().hLo}°` : "0");
  /* the palette's own colors along the plot, for the hue's line */
  const own = () =>
    data()
      .samples.filter((_, i, all) => i % 4 === 0 || i === all.length - 1)
      .map(s => ({ at: s.t * 100, color: s.hex }));
  /* an amount has a wash under its line; hue has none */
  const amount = () => props.axis !== "h";
  /* the same shape in the wash's own box, which begins at the plot's top value */
  const cut = () =>
    `path("${line(data().samples.map(s => [x(s.t), yOf(outOf(s)) - PAD]))}L${x(1).toFixed(1)},${inner()}L0,${inner()}Z")`;
  /* Each pixel is the color as the curve draws it, found with less search since it is drawn again at every move of a
     drag. Under chroma a column shares a lightness and a hue, so the most chroma the screen shows there is found once;
     under lightness each pixel's own most is found in 12 steps, well under a step of 8 bits, each step making no array
     (lchToSrgbBytes). One image, kept. It is drawn at once, and at most once more in the same frame, with the last
     palette: a key held down asks for a palette faster than the screen shows them, and the ones between are never
     seen. */
  let image: ImageData | undefined;
  let frame = 0;
  let next: readonly [Axis, Palette, number] | null = null;
  onCleanup(() => {
    if (frame) cancelAnimationFrame(frame);
  });
  const paintWash = ([axis, P, cTop]: readonly [Axis, Palette, number]) => {
    if (wash.width !== COLS) wash.width = COLS;
    if (wash.height !== ROWS) wash.height = ROWS;
    const ctx = wash.getContext("2d");
    if (!ctx) return;
    image ??= ctx.createImageData(COLS, ROWS);
    const px = image.data;
    for (let i = 0; i < COLS; i++) {
      const [L, C, H] = sampleLCH(P, (i + 0.5) / COLS);
      const most = axis === "c" ? fitChroma(L, cTop, H) : 0;
      for (let j = 0; j < ROWS; j++) {
        const up = 1 - (j + 0.5) / ROWS;
        const at = 4 * (j * COLS + i);
        if (axis === "l") lchToSrgbBytes(up, C, H, 12, px, at);
        else lchToSrgbBytes(L, Math.min(up * cTop, most), H, 24, px, at);
        px[at + 3] = Math.round((WASH_FLOOR + (WASH_TOP - WASH_FLOOR) * up) * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
  };
  const later = () => {
    frame = 0;
    if (next) paintWash(next);
    next = null;
  };
  createEffect(
    () => (amount() ? ([props.axis, props.palette, scale().cTop] as const) : null),
    now => {
      if (!now) return;
      if (frame) {
        next = now;
        return;
      }
      paintWash(now);
      frame = requestAnimationFrame(later);
    }
  );
  const held = (i: number) => props.selection.includes(i);
  const whole = () => props.selection.length === 0;
  const shown = (i: number) => props.axis !== "h" || !!data().anchors[i]?.chromatic;
  const anchorValue = (i: number) => {
    const a = data().anchors[i];
    return props.axis === "l" ? a.l : props.axis === "c" ? a.c : a.h;
  };
  const paint = (i: number) => props.stops[i]?.paint ?? props.stops[i]?.hex ?? "transparent";
  const bounds = () => {
    const d = data();
    const lo = props.axis === "h" ? d.hLo : 0;
    const hi = props.axis === "l" ? 1 : props.axis === "c" ? d.cTop : d.hHi;
    return { lo, hi, per: (hi - lo) / inner() };
  };

  const tAt = (clientX: number) => {
    const r = svg.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
  };
  const nearest = (t: number) => {
    let best = 0;
    let d = Number.POSITIVE_INFINITY;
    data().anchors.forEach((a, i) => {
      const e = Math.abs(a.t - t);
      if (e < d) {
        d = e;
        best = i;
      }
    });
    return best;
  };
  const dotAt = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    let best = -1;
    let d = DOT_REACH;
    data().anchors.forEach((a, i) => {
      if (!shown(i)) return;
      const e2 = Math.hypot(e.clientX - r.left - x(a.t), e.clientY - r.top - yOf(anchorValue(i)));
      if (e2 <= d) {
        d = e2;
        best = i;
      }
    });
    return best;
  };
  const onLine = (e: PointerEvent) => {
    const r = svg.getBoundingClientRect();
    const list = data().samples;
    const s = list[Math.round(tAt(e.clientX) * (list.length - 1))];
    return (
      !!s &&
      (props.axis !== "h" || s.out[1] >= HUE_MIN_C) &&
      Math.abs(e.clientY - r.top - yOf(outOf(s))) <= LINE_REACH
    );
  };
  /* a dot dragged: the value it began at, its bounds, the palette the drag began on, and the keyframes held before its
     press, if the press changed them */
  let drag: {
    i: number;
    pointer: number;
    y0: number;
    value: number;
    lo: number;
    hi: number;
    per: number;
    moved: boolean;
    wasHeld: boolean;
    mode: PickMode;
    from: Palette;
    before: readonly number[] | null;
  } | null = null;
  /* a press that drags no value. A mouse's holds its keyframe as it lands; a finger's holds nothing until it lifts
     (`late`), since one that goes on to scroll was no press. One that goes on across the plot is a sweep and holds the
     run it reaches (`to`): a mouse's once it reaches another keyframe (`slop` null), a finger's once it has gone
     `slop` sideways, which no scroll does. `before` is the hold the press found */
  let press: {
    i: number;
    pointer: number;
    x0: number;
    wasHeld: boolean;
    mode: PickMode;
    late: boolean;
    slop: number | null;
    to: number;
    before: readonly number[];
  } | null = null;
  const [band, setBand] = createSignal<readonly [number, number] | null>(null);
  /* nothing held, a drag on the line: the whole palette along this axis */
  let all: {
    pointer: number;
    x0: number;
    y0: number;
    per: number;
    moved: boolean;
    applied: number;
    col: number;
  } | null = null;
  const freeze = () => {
    const d = data();
    setFrozen({ cTop: d.cTop, hLo: d.hLo, hHi: d.hHi });
  };
  const letGo = (e: PointerEvent) => {
    if (svg.hasPointerCapture(e.pointerId)) svg.releasePointerCapture(e.pointerId);
  };
  /* the page took a pointer, for a scroll or a pinch's zoom, or the plot lost it: its press ends, a keyframe it dragged
     going back to where it was and a run it swept to the hold before it */
  const giveBack = (pointer: number) => {
    if (svg.hasPointerCapture(pointer)) svg.releasePointerCapture(pointer);
    if (press?.pointer === pointer) {
      if (press.to >= 0) props.onRestore?.(press.before);
      press = null;
      setBand(null);
    }
    if (drag?.pointer === pointer) {
      if (drag.moved) props.onNudge(drag.i, props.axis, drag.value, drag.from);
      if (drag.moved && drag.before) props.onRestore?.(drag.before);
      drag = null;
      setFrozen(null);
    }
    if (all?.pointer === pointer) {
      all = null;
      setFrozen(null);
    }
  };
  /* a second finger is a pinch, the page's to zoom: the first finger's press goes back */
  const pinched = (e: PointerEvent) => {
    const first = drag?.pointer ?? press?.pointer;
    if (e.pointerType !== "touch" || first === undefined || first === e.pointerId) return false;
    giveBack(first);
    return true;
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (pinched(e)) return;
    const finger = e.pointerType === "touch";
    const mode = pickModeOf(e);
    /* a mouse takes any dot; a finger drags a held keyframe from anywhere in its column */
    const col = nearest(tAt(e.clientX));
    const i = finger ? (held(col) && shown(col) ? col : -1) : dotAt(e);
    if (i >= 0) {
      e.preventDefault();
      const wasHeld = held(i);
      const picks = mode !== "one" || !wasHeld;
      const before = picks ? props.selection.slice() : null;
      if (picks) props.onPick(i, mode);
      drag = {
        i,
        pointer: e.pointerId,
        y0: e.clientY,
        value: anchorValue(i),
        ...bounds(),
        moved: false,
        wasHeld,
        mode,
        from: { anchors: props.palette.anchors.map(a => ({ ...a })) },
        before
      };
      freeze();
      svg.setPointerCapture(e.pointerId);
      props.onHover?.(null);
      return;
    }
    if (!finger && mode === "one" && whole() && props.onWhole && onLine(e)) {
      e.preventDefault();
      all = {
        pointer: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        per: bounds().per,
        moved: false,
        applied: 0,
        col
      };
      freeze();
      svg.setPointerCapture(e.pointerId);
      return;
    }
    /* anywhere else is the keyframe nearest along the palette */
    const wasHeld = held(col);
    press = {
      i: col,
      pointer: e.pointerId,
      x0: e.clientX,
      wasHeld,
      mode,
      late: finger,
      slop: finger ? SLOP : null,
      to: -1,
      before: props.selection.slice()
    };
    if (finger) return;
    /* a mouse's sweep goes on past the plot's ends, and its release is heard wherever it is */
    svg.setPointerCapture(e.pointerId);
    if (mode !== "one" || !wasHeld) props.onPick(col, mode);
  };
  const move = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointer) {
      const dy = drag.y0 - e.clientY;
      if (!drag.moved && Math.abs(dy) < (e.pointerType === "touch" ? 6 : 1)) return;
      drag.moved = true;
      props.onNudge(
        drag.i,
        props.axis,
        Math.max(drag.lo, Math.min(drag.hi, drag.value + dy * drag.per)),
        drag.from
      );
      return;
    }
    if (all && e.pointerId === all.pointer) {
      const dv = (all.y0 - e.clientY) * all.per;
      if (all.moved || Math.abs(all.y0 - e.clientY) >= 3) {
        if (!all.moved) {
          all.moved = true;
          props.onHover?.(null);
          props.onWholeStart?.();
        }
        props.onWhole?.(dv, dv - all.applied);
        all.applied = dv;
        return;
      }
      /* along the line and not up or down, it moves nothing: it is a sweep, as from anywhere else in the plot */
      if (!props.onSweep || Math.abs(e.clientX - all.x0) <= 4) return;
      press = {
        i: all.col,
        pointer: all.pointer,
        x0: all.x0,
        wasHeld: false,
        mode: "one",
        late: false,
        slop: 4,
        to: -1,
        before: props.selection.slice()
      };
      all = null;
      setFrozen(null);
    }
    if (press && e.pointerId === press.pointer) {
      const p = press;
      const at = tAt(e.clientX);
      const to = nearest(at);
      if (e.pointerType === "mouse") props.onHover?.(at);
      if (!props.onSweep || p.mode !== "one") return;
      if (p.to < 0 && !(p.slop === null ? to !== p.i : Math.abs(e.clientX - p.x0) > p.slop)) return;
      if (to === p.to) return;
      p.to = to;
      setBand([Math.min(p.i, to), Math.max(p.i, to)]);
      props.onSweep(p.i, to);
      return;
    }
    if (e.pointerType === "mouse") {
      props.onHover?.(tAt(e.clientX));
      svg.style.cursor =
        dotAt(e) >= 0 || (whole() && !!props.onWhole && onLine(e)) ? "ns-resize" : "";
    }
  };
  const up = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.pointer) {
      const d = drag;
      drag = null;
      setFrozen(null);
      letGo(e);
      /* a value changed: the hold before the press comes back. A plain click on a held keyframe lets it go, as on its
         chip */
      if (d.moved) {
        if (d.before) props.onRestore?.(d.before);
      } else if (d.mode === "one" && d.wasHeld) props.onPick(d.i, "one");
      return;
    }
    if (all && e.pointerId === all.pointer) {
      const a = all;
      all = null;
      setFrozen(null);
      letGo(e);
      /* a press that never moved is a click in the plot: the keyframe nearest it */
      if (!a.moved) props.onPick(a.col, "one");
      return;
    }
    if (press && e.pointerId === press.pointer) {
      const p = press;
      press = null;
      setBand(null);
      letGo(e);
      /* a sweep has held its run. A press that stayed one: a finger's holds its keyframe now, and a plain click on a
         held keyframe lets it go */
      if (p.to < 0 && (p.late || (p.mode === "one" && p.wasHeld)))
        props.onPick(p.i, p.late ? p.mode : "one");
    }
  };
  onSettled(() => {
    const stop = watchSize(host, () => setWidth(host.clientWidth || 480));
    /* a finger on a held keyframe drags it; the page keeps every other touch, and two fingers, which it may zoom with
       if the first has not moved yet */
    const touch = (e: TouchEvent) => {
      if (drag && e.touches.length === 1) e.preventDefault();
    };
    host.addEventListener("touchmove", touch, { passive: false });
    return () => {
      stop();
      host.removeEventListener("touchmove", touch);
    };
  });
  const reading = () => {
    const at = props.reading;
    if (at == null) return null;
    const list = data().samples;
    return list[Math.round(at * (list.length - 1))];
  };
  const runX = (end: 0 | 1) => {
    const run = band();
    return run ? x(data().anchors[run[end]]?.t ?? 0) : 0;
  };
  return (
    <div ref={host} class={styles.host} dir="ltr" style={{ height: `${props.height}px` }}>
      <span class={styles.ground} aria-hidden="true" />
      <canvas
        ref={wash}
        class={styles.wash}
        style={{ display: amount() ? "block" : "none", "clip-path": cut() }}
      />
      <svg
        ref={svg}
        class={styles.svg}
        width={width()}
        height={props.height}
        role="img"
        aria-label={props["aria-label"]}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={e => giveBack(e.pointerId)}
        onLostPointerCapture={e => giveBack(e.pointerId)}
        onPointerLeave={() => {
          if (!drag && !all && !press) props.onHover?.(null);
        }}
      >
        <defs>
          <linearGradient
            id={`${id}-own`}
            gradientUnits="userSpaceOnUse"
            x1={x(0)}
            x2={x(1)}
            y1={0}
            y2={0}
          >
            <For each={own()} keyed={false}>
              {stop => <stop offset={`${stop().at.toFixed(1)}%`} stop-color={stop().color} />}
            </For>
          </linearGradient>
        </defs>
        <text class={styles.scale} x={width()} y={PAD - 3}>
          {top()}
        </text>
        <text class={styles.scale} x={width()} y={props.height - 1}>
          {foot()}
        </text>
        <Show when={band()}>
          <rect
            class={styles.band}
            x={runX(0)}
            y={PAD}
            width={Math.max(0, runX(1) - runX(0))}
            height={inner()}
          />
        </Show>
        <For each={data().anchors} keyed={false}>
          {(a, i) => (
            <Show when={held(i)}>
              <line
                class={styles.mark}
                x1={x(a().t)}
                x2={x(a().t)}
                y1={PAD}
                y2={props.height - PAD}
              />
            </Show>
          )}
        </For>
        <Show when={props.axis === "c" && data().askVisible}>
          <path class={styles.ask} d={askPath()} />
        </Show>
        <Show
          when={amount()}
          fallback={
            <For each={data().hueSegments} keyed={false}>
              {run => (
                <>
                  <path class={styles.hueRim} d={segment(run())} />
                  <path class={styles.hue} d={segment(run())} stroke={`url(#${id}-own)`} />
                </>
              )}
            </For>
          }
        >
          <path class={styles.curve} d={path()} />
        </Show>
        <g class={styles.read} data-on={reading() ? "" : undefined}>
          <line
            class={styles.cross}
            x1={x(reading()?.t ?? 0)}
            x2={x(reading()?.t ?? 0)}
            y1={PAD}
            y2={props.height - PAD}
          />
          <Show when={props.axis !== "h" || (reading()?.out[1] ?? 0) >= HUE_MIN_C}>
            <circle
              class={styles.readDot}
              cx={x(reading()?.t ?? 0)}
              cy={yOf(reading() ? outOf(reading() as CurveSample) : 0)}
              r={4}
              style={{ fill: reading()?.hex ?? "none" }}
            />
          </Show>
        </g>
        <For each={data().anchors} keyed={false}>
          {(a, i) => (
            <Show when={shown(i)}>
              <circle
                class={styles.ring}
                data-on={held(i) ? "" : undefined}
                cx={x(a().t)}
                cy={yOf(anchorValue(i))}
                r={DOT + 3.5}
              />
              <circle class={styles.rim} cx={x(a().t)} cy={yOf(anchorValue(i))} r={DOT + 1.5} />
              <circle
                class={styles.dot}
                cx={x(a().t)}
                cy={yOf(anchorValue(i))}
                r={DOT}
                style={{ fill: paint(i) }}
              />
            </Show>
          )}
        </For>
      </svg>
    </div>
  );
}
