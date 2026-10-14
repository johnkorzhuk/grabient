import { luminance } from "@grabient/engine/contrast.ts";
import { cellAt, layoutStops, placeMark, type StripStop } from "@grabient/engine/strip.ts";
import { createMemo, createSignal, For, onSettled } from "solid-js";
import { announce } from "./announce.ts";
import { copyText } from "./copy.ts";
import { createDone } from "./done.ts";
import { createFlashGuard } from "./flash.ts";
import { t } from "./i18n.ts";
import { watchSize } from "./measure.ts";
import styles from "./StopStrip.module.css";
import { tooltip } from "./Tooltip.tsx";

export type { StripStop };
/** A held keyframe's dot on the strip: where it is along the palette, and its color. */
export interface StripMark {
  t: number;
  paint: string;
}

/* The palette's stops as one perforated strip: chips fused edge to edge, each hex in black or white, whichever reads,
   the seams and the foot dashed in the paper's color as cuts through to it. Rows and label size come from the engine's
   layoutStops. A press copies a chip's hex. While a plot or the path reads a place (`reading`), the chip nearest it
   rises 8px out of the strip and nothing else moves. It is a big picture, so it paints through the flash guard: a
   change that would turn a flash back sooner than a quarter second after it waits. Left to right in every language,
   as the gradient runs. */
export function StopStrip(props: {
  stops: readonly StripStop[];
  marks?: readonly StripMark[];
  /** one row whatever the width, at a phone's height */
  short?: boolean;
  /** the strip stands at the screen's foot: its colors run beneath a phone's home indicator */
  inset?: boolean;
  onCopy?: (hex: string) => void;
  /** the place along the gradient being read, 0 to 1 */
  reading?: number | null;
}) {
  let host!: HTMLDivElement;
  const [width, setWidth] = createSignal(900);
  onSettled(() => watchSize(host, () => setWidth(host.clientWidth || 900)));
  const stops = createFlashGuard(
    () => props.stops,
    shown => shown.map(s => luminance(s.hex))
  );
  /* every chip reads the layout, and a hundred stops would lay out hundreds of times an edit without the memo */
  const lay = createMemo(() => layoutStops(stops(), width(), !!props.short));
  /* the chip being read as one key, so a reading that moves within a chip changes nothing */
  const read = createMemo(() => {
    const at = props.reading;
    if (at == null || !stops().length) return "";
    const c = cellAt(lay(), stops().length, at);
    return `${c.row}:${c.cell}`;
  });
  const marksIn = (r: number) =>
    (props.marks ?? [])
      .map(m => ({ ...m, ...placeMark(lay(), stops().length, m.t) }))
      .filter(m => m.row === r);
  const [copied, mark] = createDone<string>(1100);
  /* a chip says Copied only for a copy that happened; a reader who listens hears either result */
  const copy = async (hex: string) => {
    props.onCopy?.(hex);
    if (await copyText(hex)) {
      mark(hex);
      announce(t("Copied"));
    } else announce(t("Couldn't copy. Select the text and copy it."));
  };
  /* one Tab stop however many colors, on the chip focused last; the arrows walk the colors, Home and End the ends */
  const [at, setAt] = createSignal(0);
  const count = () => lay().rows.reduce((n, row) => n + row.length, 0);
  const current = () => Math.min(at(), Math.max(0, count() - 1));
  const before = (r: number) =>
    lay()
      .rows.slice(0, r)
      .reduce((n, row) => n + row.length, 0);
  const walk = (e: KeyboardEvent) => {
    const i = current();
    const last = count() - 1;
    const j =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? last
          : e.key === "ArrowRight" || e.key === "ArrowDown"
            ? Math.min(last, i + 1)
            : e.key === "ArrowLeft" || e.key === "ArrowUp"
              ? Math.max(0, i - 1)
              : -1;
    if (j < 0) return;
    e.preventDefault();
    setAt(j);
    host.querySelectorAll<HTMLElement>("button")[j]?.focus();
  };
  return (
    /* biome-ignore lint/a11y/useSemanticElements: a group of presses, each named by what it copies; the chips keep the
       button role, so they are no list items */
    <div
      ref={host}
      class={styles.strip}
      data-two={lay().two ? "" : undefined}
      data-short={props.short ? "" : undefined}
      style={{ "--sw": `${lay().size}px` }}
      dir="ltr"
      role="group"
      aria-label={t("Palette colors")}
      onKeyDown={walk}
    >
      <For each={lay().rows} keyed={false}>
        {(row, r) => (
          <div class={styles.row} data-back={r > 0 ? "" : undefined}>
            <For each={row()} keyed={false}>
              {(cell, i) => {
                const tip = tooltip(() => t("Copy"));
                const lit = () => read() === `${r}:${i}`;
                return (
                  <button
                    ref={tip}
                    type="button"
                    class={styles.chip}
                    data-ink={cell().ink}
                    data-seam={(r > 0 ? i < row().length - 1 : i > 0) ? "" : undefined}
                    data-read={lit() ? "" : undefined}
                    data-inset={props.inset && r === lay().rows.length - 1 ? "" : undefined}
                    style={{
                      "--span": String(cell().span),
                      "--paint": cell().paint,
                      background: cell().paint
                    }}
                    aria-label={t("Copy {hex}", { hex: cell().hex })}
                    tabindex={before(r) + i === current() ? 0 : -1}
                    onFocus={() => setAt(before(r) + i)}
                    onClick={() => void copy(cell().hex)}
                  >
                    <span
                      class={styles.label}
                      data-vertical={lay().vertical ? "" : undefined}
                      data-hide={lay().show ? undefined : ""}
                    >
                      {copied() === cell().hex ? t("Copied") : cell().hex}
                    </span>
                  </button>
                );
              }}
            </For>
            <For each={marksIn(r)} keyed={false}>
              {m => (
                <i
                  class={styles.mark}
                  style={{ "--x": (m().x / 100).toFixed(4), "--c": m().paint }}
                  aria-hidden="true"
                />
              )}
            </For>
          </div>
        )}
      </For>
    </div>
  );
}

/** The strip as the server draws it, before any script runs: the same chips, rows and hexes, at whatever width it
    stands, laid out by the styles alone, as layoutStops lays them out. A stop's `paint` is its color on a wide-gamut
    screen, which the styles take there. Nothing on it is pressed. */
export function StillStrip(props: { stops: readonly StripStop[] }) {
  /* one row, and for a run long enough to stand in two (layoutStops' rule) the two, which the styles choose between */
  const one = layoutStops(props.stops, 0, true);
  const variants = props.stops.length >= 12 ? [one, layoutStops(props.stops, 640)] : [one];
  return (
    <div class={[styles.strip, styles.still]} style={{ "--units": props.stops.length }} dir="ltr">
      {variants.map(lay => (
        <div
          class={styles.variant}
          data-rows={lay.rows.length}
          style={{ "--least": Math.min(...lay.rows.flat().map(cell => cell.span)) }}
        >
          {lay.rows.map((row, r) => (
            <div class={styles.row} data-back={r > 0 ? "" : undefined}>
              {row.map((cell, i) => (
                <span
                  class={styles.chip}
                  data-ink={cell.ink}
                  data-seam={(r > 0 ? i < row.length - 1 : i > 0) ? "" : undefined}
                  style={{
                    "--span": String(cell.span),
                    "--hex": cell.hex,
                    "--paint": cell.paint
                  }}
                >
                  <span class={styles.fit}>
                    <span class={styles.label}>{cell.hex}</span>
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
