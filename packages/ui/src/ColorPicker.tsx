import { hexToSrgb, toHex } from "@grabient/engine/color.ts";
import { okhsvPaint, okhsvToSrgb, srgbToOkhsv } from "@grabient/engine/okhsv.ts";
import { typedHex } from "@grabient/engine/typed.ts";
import { Portal } from "@solidjs/web";
import { createEffect, createSignal, type Element, onSettled, Show } from "solid-js";
import { BarRim } from "./BarRim.tsx";
import { Button } from "./Button.tsx";
import styles from "./ColorPicker.module.css";
import { focusLeft, openedBy, pressOutside } from "./dismiss.ts";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { composing, matches } from "./keys.ts";
import { SLOP } from "./press.ts";
import { space } from "./tokens.ts";

/* A color picker as a designer knows it: a panel over the page beside the press it opened from, taking no room. A
   field of saturation (across) and brightness (up) at one hue, white at its top start and black along its foot, the
   hues under it, and the hex on a line of its own. It is Okhsv over OKLab, so its hue is the one the editor's Hue
   reads. Each move hands on one hex a frame however fast the pointer goes, and a release hands on the last at once, so
   a drag is one gesture of the undo. A finger on the field picks at once, since every way across it is a color; the
   strip waits for a move along it, so a finger scrolling past leaves it alone. The arrows move what has focus, Shift
   ten times as far, and every other key is the page's. A color the page refuses is put back. A press outside or Escape
   puts it away and gives the press that opened it the keyboard back. Left to right in every language. */

export type HSV = [h: number, s: number, v: number];

/* the field is smooth, so it is painted this small and drawn to size */
const COLS = 96;
const ROWS = 40;
const GAP = space.s2;
const EDGE = space.s4;
const ARROWS = [
  ["ArrowLeft", -1, 0],
  ["ArrowRight", 1, 0],
  ["ArrowUp", 0, 1],
  ["ArrowDown", 0, -1]
] as const;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const hexOf = (h: number, s: number, v: number) => toHex(okhsvToSrgb(h, s, v));
/* the strip's hues, each as colorful as sRGB holds it, worked out once */
let strip = "";
const hues = () => {
  strip ||= `linear-gradient(to right, ${Array.from({ length: 25 }, (_, i) => `${hexOf(i * 15, 1, 1)} ${((i / 24) * 100).toFixed(2)}%`).join(", ")})`;
  return strip;
};
/* what Tab stops on, in its order: the panel stands at the body's end, out of the page's own order */
const tabbables = (root: ParentNode) =>
  [
    ...root.querySelectorAll<HTMLElement>(
      "a[href], button:not([disabled]), input:not([disabled]), [tabindex]"
    )
  ].filter(el => el.tabIndex >= 0 && !el.closest("[inert]") && el.getClientRects().length > 0);
interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}

export interface ColorPickerProps {
  /** the color, six hex digits */
  value: string;
  /** each move of the field, the hues or the eyedropper: the color it comes to; false where the page refuses it */
  onInput: (hex: string) => unknown;
  /** a hex typed on its line; onInput where none is given; false where the page refuses it */
  onCommit?: (hex: string) => unknown;
  /** the press it opened from: it hangs from it and gives it the keyboard back */
  anchor?: HTMLElement;
  /** the panel the press stands in, whose controls it changes: it stands beside that panel instead, level with the
      press, toward the line's start or its end where there is room */
  beside?: HTMLElement;
  toward?: "start" | "end";
  /** a press at the end of the hex's line that acts on the color: Remove */
  end?: Element;
  /** a press outside it, Escape, or the keyboard leaving it */
  onClose?: () => void;
}

export function ColorPicker(props: ColorPickerProps) {
  let host!: HTMLDivElement;
  let field!: HTMLDivElement;
  let paint!: HTMLCanvasElement;
  let hueBox!: HTMLDivElement;
  let input!: HTMLInputElement;
  /* where the picker stands, kept while it hands on hexes: a gray has no hue and black no saturation, so a hex from
     outside moves it but leaves those as they were */
  const [hsv, setHsv] = createSignal<HSV>([0, 0, 0]);
  let sent = "";
  const from = (hex: string) => {
    const rgb = hexToSrgb(hex);
    if (!rgb) return;
    const [h, s, v] = srgbToOkhsv(rgb);
    setHsv(([h0, s0]) => [s > 1e-4 && v > 1e-4 ? h : h0, v > 1e-4 ? s : s0, v]);
    /* where it stands now, so the hex it sent last, brought back by a redo, moves it again */
    sent = hex.toLowerCase();
  };
  createEffect(
    () => props.value,
    hex => {
      if (document.activeElement !== input) input.value = hex;
      if (hex.toLowerCase() !== sent) from(hex);
    }
  );
  const go = (h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    const hex = hexOf(h, s, v);
    if (hex === sent) return;
    sent = hex;
    props.onInput(hex);
  };
  /* the field at the picker's hue, into one image kept for every paint */
  let image: ImageData | null = null;
  createEffect(
    () => hsv()[0],
    h => {
      const ctx = paint.getContext("2d");
      if (!ctx) return;
      if (!image) {
        paint.width = COLS;
        paint.height = ROWS;
        image = ctx.createImageData(COLS, ROWS);
      }
      okhsvPaint(h, COLS, ROWS, image.data);
      ctx.putImageData(image, 0, 0);
    }
  );

  /* a pointer's moves are taken once a frame, the latest of them; a release takes what waits at once */
  let waiting: (() => void) | null = null;
  let frame = 0;
  const flush = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    const work = waiting;
    waiting = null;
    work?.();
  };
  const soon = (work: () => void) => {
    waiting = work;
    frame ||= requestAnimationFrame(flush);
  };
  /* the field's and the strip's boxes, read once a gesture and again after the panel moves */
  let fieldBox: DOMRect | null = null;
  let hueRect: DOMRect | null = null;

  let fieldPointer: number | null = null;
  const pickAt = (x: number, y: number) => {
    fieldBox ??= field.getBoundingClientRect();
    const r = fieldBox;
    go(hsv()[0], clamp01((x - r.left) / r.width), clamp01(1 - (y - r.top) / r.height));
  };
  const fieldDown = (e: PointerEvent) => {
    if (e.button !== 0 || fieldPointer !== null) return;
    fieldPointer = e.pointerId;
    fieldBox = field.getBoundingClientRect();
    field.setPointerCapture(e.pointerId);
    pickAt(e.clientX, e.clientY);
  };
  const fieldMove = (e: PointerEvent) => {
    if (e.pointerId !== fieldPointer) return;
    const { clientX, clientY } = e;
    soon(() => pickAt(clientX, clientY));
  };
  const fieldUp = (e: PointerEvent) => {
    if (e.pointerId !== fieldPointer) return;
    flush();
    if (field.hasPointerCapture(e.pointerId)) field.releasePointerCapture(e.pointerId);
    fieldPointer = null;
  };

  /* the strip takes a mouse at once, and a finger once it moves along the strip more than across it */
  let huePointer: number | null = null;
  let x0 = 0;
  let y0 = 0;
  let along = false;
  const hueAt = (x: number) => {
    hueRect ??= hueBox.getBoundingClientRect();
    const [, s, v] = hsv();
    go(clamp01((x - hueRect.left) / hueRect.width) * 360, s, v);
  };
  const hueDown = (e: PointerEvent) => {
    if (e.button !== 0 || huePointer !== null) return;
    huePointer = e.pointerId;
    x0 = e.clientX;
    y0 = e.clientY;
    along = e.pointerType !== "touch";
    hueRect = hueBox.getBoundingClientRect();
    hueBox.setPointerCapture(e.pointerId);
    if (along) hueAt(e.clientX);
  };
  const hueLetGo = (e: PointerEvent) => {
    if (e.pointerId !== huePointer) return;
    flush();
    if (hueBox.hasPointerCapture(e.pointerId)) hueBox.releasePointerCapture(e.pointerId);
    huePointer = null;
  };
  const hueMove = (e: PointerEvent) => {
    if (e.pointerId !== huePointer) return;
    if (!along) {
      const dx = Math.abs(e.clientX - x0);
      const dy = Math.abs(e.clientY - y0);
      if (dx < SLOP && dy < SLOP) return;
      if (dy >= dx) return hueLetGo(e);
      along = true;
    }
    const { clientX } = e;
    soon(() => hueAt(clientX));
  };
  /* a finger's tap on the strip picks where it lands */
  const hueUp = (e: PointerEvent) => {
    if (e.pointerId === huePointer && !along && e.pointerType === "touch") hueAt(e.clientX);
    hueLetGo(e);
  };

  /* the arrows move what has focus, Shift ten times as far, and the page never sees them */
  const arrow = (e: KeyboardEvent): [number, number] | null => {
    for (const [key, x, y] of ARROWS)
      if (matches(e, key) || matches(e, `Shift+${key}`)) {
        const k = e.shiftKey ? 10 : 1;
        return [x * k, y * k];
      }
    return null;
  };
  const fieldKey = (e: KeyboardEvent) => {
    const by = arrow(e);
    if (!by) return;
    e.preventDefault();
    e.stopPropagation();
    const [h, s, v] = hsv();
    go(h, clamp01(s + by[0] / 100), clamp01(v + by[1] / 100));
  };
  const hueKey = (e: KeyboardEvent) => {
    const by = arrow(e);
    const [h, s, v] = hsv();
    const next = by ? h + by[0] + by[1] : matches(e, "Home") ? 0 : matches(e, "End") ? 360 : null;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    go(Math.min(360, Math.max(0, next)), s, v);
  };

  /* the hex's line: a hex typed commits with Enter or by leaving it; anything else is put back, and so is a hex the
     page refuses */
  const commit = () => {
    const hex = typedHex(input.value);
    if (!hex || hex === props.value.toLowerCase()) {
      input.value = props.value;
      return;
    }
    if ((props.onCommit ?? props.onInput)(hex) === false) {
      input.value = props.value;
      input.select();
      return;
    }
    from(hex);
  };
  const lineKey = (e: KeyboardEvent) => {
    if (composing(e)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      commit();
      input.select();
    } else if (e.key === "Escape") input.value = props.value;
  };

  /* the eyedropper, where the browser has one: known once the page has settled, as the server knows none */
  const [dropper, setDropper] = createSignal<(new () => EyeDropperLike) | null>(null);
  const drop = () => {
    const Dropper = dropper();
    if (!Dropper) return;
    new Dropper().open().then(
      picked => {
        const hex = typedHex(picked.sRGBHex);
        if (!hex || hex === props.value.toLowerCase() || props.onInput(hex) === false) return;
        from(hex);
      },
      () => {}
    );
  };

  /* It hangs from the press as a menu does, a gap from it and start to start: under it, or over it where there is more
     room above, inside the window and under a header pinned at its top. Beside a panel (`beside`) it stands next to
     that panel instead, toward the side asked where there is room and the other where not, level with the press as
     far as the panel's height allows: its foot never below the panel's, its top never above it, so it stands against
     the panel rather than hanging past it (the Appearance menu's ground, in its last row); with room on neither side
     it hangs from the press. Read again once a frame as the page scrolls or the window changes. */
  const [placed, setPlaced] = createSignal(false);
  let placing = 0;
  const place = () => {
    placing = 0;
    const at = props.anchor ?? props.beside;
    if (!at || !host.isConnected) return;
    const press = at.getBoundingClientRect();
    const w = host.offsetWidth;
    const h = host.offsetHeight;
    const ceiling =
      [...document.querySelectorAll("header")].reduce((most, head) => {
        const r = head.getBoundingClientRect();
        return r.top <= 0 && r.bottom > most ? r.bottom : most;
      }, 0) + EDGE;
    const floor = innerHeight - EDGE;
    const keep = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
    let x: number | null = null;
    let y = 0;
    if (props.beside) {
      const box = props.beside.getBoundingClientRect();
      const left = box.left - GAP - w;
      const right = box.right + GAP;
      const fitsLeft = left >= EDGE;
      const fitsRight = right + w <= innerWidth - EDGE;
      const wantLeft =
        ((props.toward ?? "end") === "start") !==
        (getComputedStyle(props.beside).direction === "rtl");
      if (fitsLeft || fitsRight) {
        x = (wantLeft ? fitsLeft : !fitsRight) ? left : right;
        y = keep(Math.max(box.top, Math.min(press.top, box.bottom - h)), ceiling, floor - h);
      }
    }
    if (x === null) {
      const rtl = getComputedStyle(at).direction === "rtl";
      const below = floor - press.bottom - GAP;
      const above = press.top - GAP - ceiling;
      x = keep(rtl ? press.right - w : press.left, EDGE, innerWidth - EDGE - w);
      y =
        h <= below || below >= above
          ? keep(press.bottom + GAP, ceiling, floor - h)
          : keep(press.top - GAP - h, ceiling, floor - h);
    }
    host.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    fieldBox = hueRect = null;
    setPlaced(true);
  };
  const replace = () => {
    placing ||= requestAnimationFrame(place);
  };
  /* the keyboard leaving the panel for the page puts it away */
  const leave = (e: FocusEvent) => {
    if (focusLeft(e, host, props.anchor)) props.onClose?.();
  };
  const key = (e: KeyboardEvent) => {
    /* Tab past either end goes on from the press, as if the panel stood beside it: back to the press, or on to what
       follows it, never to the page's end where the panel is mounted */
    if (props.anchor && (matches(e, "Tab") || matches(e, "Shift+Tab"))) {
      const own = tabbables(host);
      const back = e.shiftKey;
      if (document.activeElement !== (back ? own[0] : own[own.length - 1])) return;
      e.preventDefault();
      const at = props.anchor;
      const page = tabbables(document).filter(el => !host.contains(el));
      props.onClose?.();
      (back ? at : (page[page.indexOf(at) + 1] ?? at)).focus();
      return;
    }
    if (!matches(e, "Escape")) return;
    e.preventDefault();
    e.stopPropagation();
    props.onClose?.();
    props.anchor?.focus();
  };
  onSettled(() => {
    const Dropper = (window as unknown as { EyeDropper?: new () => EyeDropperLike }).EyeDropper;
    if (Dropper) setDropper(() => Dropper);
    /* a press or the keyboard in it is inside the panel its press stands in (the appearance menu) */
    openedBy(host, props.anchor);
    place();
    /* the field takes the keyboard once the panel is seen: a field not yet shown takes no focus */
    requestAnimationFrame(() => {
      if (host.isConnected) field.focus({ preventScroll: true });
    });
    const sizes = new ResizeObserver(replace);
    sizes.observe(host);
    addEventListener("scroll", replace, { capture: true, passive: true });
    addEventListener("resize", replace);
    const away = pressOutside(
      () => [host, props.anchor],
      () => props.onClose?.()
    );
    return () => {
      sizes.disconnect();
      removeEventListener("scroll", replace, { capture: true });
      removeEventListener("resize", replace);
      away();
      cancelAnimationFrame(placing);
      cancelAnimationFrame(frame);
    };
  });

  const pct = (v: number) => Math.round(v * 100);
  return (
    <Portal mount={document.body}>
      <div
        ref={host}
        class={styles.float}
        data-placed={placed() ? "" : undefined}
        role="dialog"
        aria-label={t("Color picker")}
        dir="ltr"
        onKeyDown={key}
        onFocusOut={leave}
      >
        <div class={styles.body}>
          {/* biome-ignore lint/a11y/useFocusableInteractive: tabindex is written in Solid's lowercase, which the rule misses */}
          <div
            ref={field}
            class={styles.field}
            tabindex={0}
            role="slider"
            aria-label={t("Saturation and brightness")}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct(hsv()[2])}
            aria-valuetext={t("Saturation {saturation}%, brightness {brightness}%", {
              saturation: pct(hsv()[1]),
              brightness: pct(hsv()[2])
            })}
            onPointerDown={fieldDown}
            onPointerMove={fieldMove}
            onPointerUp={fieldUp}
            onPointerCancel={fieldUp}
            onKeyDown={fieldKey}
          >
            <canvas ref={paint} class={styles.paint} />
            <span class={styles.rim} aria-hidden="true" />
            <span
              class={styles.thumb}
              aria-hidden="true"
              style={{
                "--x": `${(hsv()[1] * 100).toFixed(2)}%`,
                "--y": `${((1 - hsv()[2]) * 100).toFixed(2)}%`,
                "--c": hexOf(...hsv())
              }}
            />
          </div>
          <div class={styles.row}>
            <Show when={dropper()}>
              <Button
                icon
                variant="ghost"
                aria-label={t("Pick color")}
                tip={t("Pick color")}
                onClick={drop}
              >
                <Icon name="pipette" size={14} />
              </Button>
            </Show>
            {/* biome-ignore lint/a11y/useFocusableInteractive: tabindex is written in Solid's lowercase, which the rule misses */}
            <div
              ref={hueBox}
              class={styles.hue}
              tabindex={0}
              role="slider"
              aria-label={t("Hue")}
              aria-valuemin={0}
              aria-valuemax={360}
              aria-valuenow={Math.round(hsv()[0])}
              aria-valuetext={`${Math.round(hsv()[0])}°`}
              onPointerDown={hueDown}
              onPointerMove={hueMove}
              onPointerUp={hueUp}
              onPointerCancel={hueLetGo}
              onKeyDown={hueKey}
            >
              <span class={styles.band} style={{ "background-image": hues() }} aria-hidden="true" />
              <span
                class={styles.thumb}
                aria-hidden="true"
                style={{
                  "--x": `${((hsv()[0] / 360) * 100).toFixed(2)}%`,
                  "--y": "50%",
                  "--c": hexOf(hsv()[0], 1, 1)
                }}
              />
            </div>
          </div>
          <div class={styles.line}>
            <div class={styles.wrap}>
              <BarRim />
              <label class={styles.box}>
                <span class={styles.label}>Hex</span>
                <input
                  ref={input}
                  class={styles.input}
                  type="text"
                  spellcheck="false"
                  autocomplete="off"
                  aria-label={t("Hex color")}
                  defaultValue={props.value}
                  onFocus={() => input.select()}
                  onBlur={commit}
                  onKeyDown={lineKey}
                />
              </label>
            </div>
            {props.end}
          </div>
        </div>
      </div>
    </Portal>
  );
}
