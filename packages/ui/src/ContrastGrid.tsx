import { toHex } from "@grabient/engine/color.ts";
import {
  CONTRAST_AAA,
  CONTRAST_LARGE,
  CONTRAST_MINE,
  CONTRAST_TEXT,
  contrastGrounds,
  contrastInks,
  contrastTaken,
  withBlack,
  withWhite
} from "@grabient/engine/contrast.ts";
import { createMemo, createSignal, type Element, For, onSettled, Show } from "solid-js";
import { Button } from "./Button.tsx";
import { ColorPicker } from "./ColorPicker.tsx";
import styles from "./ContrastGrid.module.css";
import { pressOutside } from "./dismiss.ts";
import { Icon } from "./Icon.tsx";
import { dir, formatNumber, msg, rich, t } from "./i18n.ts";
import { matches } from "./keys.ts";
import { tooltip } from "./Tooltip.tsx";
import { space } from "./tokens.ts";

/* Which text reads on a palette's colors, as samples and no words: the colors stand side by side as grounds, and each
   row is one ink set as "Aa" on every ground it reads on, at text size where it reaches 4.5 to 1, at large size where
   it reaches 3 to 1, and not at all under that. White and black always have rows; then each of the palette's colors
   that reads on another; then the reader's own (`inks`), read or not; no color is two rows (the engine's
   contrastInks). The line under the grid says the cell under the pointer, a finger or the keyboard: both colors, the
   contrast and its level, AAA included; at rest what the two sizes stand for. The plus at its start adds a text color
   where the next coin would stand, and a reader's coin hangs the color picker from it. Eight colors at most, evenly
   taken, left to right in every language. */

/** A palette color as the grid draws it: its hex, and the wider color the screen paints where it has one. */
export interface GridColor {
  hex: string;
  paint?: string;
}
type Cell = readonly [row: number, column: number];

/* a new text color starts at the first of these grays the grid has no row of, a dark one most text is set in first;
   past them, any gray it has none of */
const STARTS = [0.2, 0.4, 0.6, 0.8, 0.1, 0.3, 0.5, 0.7, 0.9].map(v => toHex([v, v, v]));
const GRAYS = Array.from({ length: 254 }, (_, k) =>
  toHex([(k + 1) / 255, (k + 1) / 255, (k + 1) / 255])
);
const ARROWS = [
  ["ArrowLeft", 0, -1],
  ["ArrowRight", 0, 1],
  ["ArrowUp", -1, 0],
  ["ArrowDown", 1, 0]
] as const;
/* white's and black's rows wear the theme's own white and black */
const ON_DARK = "var(--color-on-dark)";
const ON_LIGHT = "var(--color-on-light)";
/** A contrast as the line writes it, the reader's way and never rounded up across a line: 4.496 is 4.49:1. */
const ratioText = (ratio: number) =>
  `${formatNumber(Math.floor(ratio * 100) / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}:1`;
const levelOf = (ratio: number) =>
  ratio >= CONTRAST_AAA
    ? t("AAA")
    : ratio >= CONTRAST_TEXT
      ? t("AA")
      : ratio >= CONTRAST_LARGE
        ? t("AA Large")
        : "";
const same = (a: Cell | null, b: Cell | null) => !!a && !!b && a[0] === b[0] && a[1] === b[1];

export function ContrastGrid(props: {
  colors: readonly GridColor[];
  /** the rows share the height the grid is given */
  fill?: boolean;
  "aria-label": string;
  /** the reader's own text colors, as hex */
  inks?: readonly string[];
  /** the reader's colors as they now stand: with it the plus and the coins are presses */
  onInks?: (inks: string[]) => void;
}) {
  let table!: HTMLDivElement;
  let line!: HTMLSpanElement;
  let ruler!: HTMLSpanElement;
  let adder: HTMLButtonElement | undefined;
  const grounds = createMemo(() => contrastGrounds(props.colors));
  const inks = () => props.inks ?? [];
  const rows = createMemo(() =>
    contrastInks(
      grounds().map(g => g.hex),
      inks()
    ).map((ink, i) => ({
      ...ink,
      paint:
        ink.mine !== undefined
          ? ink.hex
          : ink.at >= 0
            ? (grounds()[ink.at].paint ?? ink.hex)
            : i === 0
              ? ON_DARK
              : ON_LIGHT
    }))
  );
  /* the cell the line says: under a mouse, holding the focus, or the last a finger tapped, until a tap elsewhere */
  const [hovered, setHovered] = createSignal<Cell | null>(null);
  const [focused, setFocused] = createSignal<Cell | null>(null);
  const [held, setHeld] = createSignal<Cell | null>(null);
  /* the one cell Tab reaches; the arrows move it */
  const [tab, setTab] = createSignal<Cell>([0, 0]);
  const spot = () => hovered() ?? focused() ?? held();
  const reading = createMemo(() => {
    const s = spot();
    const row = s && rows()[s[0]];
    const ground = s && grounds()[s[1]];
    if (!s || !row || !ground || s[1] === row.at) return null;
    return {
      ink: row.hex,
      inkPaint: row.paint,
      ground: ground.hex,
      groundPaint: ground.paint ?? ground.hex,
      ratio: row.ratios[s[1]] ?? 0
    };
  });
  type Reading = NonNullable<ReturnType<typeof reading>>;
  /* the line's two colors, each a swatch and its hex; `whole` keeps the hexes, for the ruler */
  const pairOf = (r: () => Reading, whole: boolean) => {
    const part = (hex: () => string, paint: () => string) => (
      <span class={styles.part}>
        <span class={styles.chip} style={{ background: paint() }} />
        <span class={styles.hex} data-whole={whole ? "" : undefined} data-hex="">
          {hex()}
        </span>
      </span>
    );
    return rich<Element>("<text/> on <ground/>", {
      text: () =>
        part(
          () => r().ink,
          () => r().inkPaint
        ),
      ground: () =>
        part(
          () => r().ground,
          () => r().groundPaint
        )
    });
  };
  const scoreOf = (r: () => Reading) => (
    <span class={styles.score}>
      {ratioText(r().ratio)}
      <Show when={levelOf(r().ratio)}>{level => <span>{level()}</span>}</Show>
    </span>
  );
  const cellOf = (target: EventTarget | null): Cell | null => {
    const cell = (target as HTMLElement | null)?.closest?.("[data-cell]");
    return cell && table.contains(cell)
      ? [Number(cell.getAttribute("data-i")), Number(cell.getAttribute("data-j"))]
      : null;
  };
  /* Tab reaches the cell it last left, kept inside a grid that lost rows or colors */
  const tabbed = (): Cell => {
    const [i, j] = tab();
    return [Math.min(i, rows().length - 1), Math.min(j, grounds().length - 1)];
  };
  const moveTo = (i: number, j: number) => {
    const next: Cell = [
      Math.max(0, Math.min(i, rows().length - 1)),
      Math.max(0, Math.min(j, grounds().length - 1))
    ];
    setTab(next);
    table
      .querySelector<HTMLElement>(`[data-cell][data-i="${next[0]}"][data-j="${next[1]}"]`)
      ?.focus();
  };
  const walk = (e: KeyboardEvent) => {
    const at = cellOf(e.target);
    if (!at) return;
    const by = ARROWS.find(([name]) => matches(e, name));
    const to = by
      ? [at[0] + by[1], at[1] + by[2]]
      : matches(e, "Home")
        ? [at[0], 0]
        : matches(e, "End")
          ? [at[0], grounds().length - 1]
          : null;
    if (!to) return;
    e.preventDefault();
    moveTo(to[0], to[1]);
  };

  /* the reader's color whose picker is up, and the coin it hangs from */
  const [opened, setOpened] = createSignal<{ i: number; at: HTMLElement } | null>(null);
  const shown = () => {
    const o = opened();
    return o && o.i < inks().length && props.onInks ? o : null;
  };
  const groundHexes = () => grounds().map(g => g.hex);
  /* a color the grid has a row of already is refused */
  const change = (i: number, hex: string) => {
    if (contrastTaken(hex, groundHexes(), inks(), i)) return false;
    props.onInks?.(inks().map((was, j) => (j === i ? hex : was)));
    return true;
  };
  /* a new color takes the next row at a gray the grid has none of, and its picker comes up by its coin once drawn */
  const add = () => {
    const n = inks().length;
    if (n >= CONTRAST_MINE) return;
    const start = [...STARTS, ...GRAYS].find(hex => !contrastTaken(hex, groundHexes(), inks()));
    if (!start) return;
    props.onInks?.([...inks(), start]);
    requestAnimationFrame(() => {
      const at = table.querySelector<HTMLElement>(`[data-mine="${n}"]`);
      if (at) setOpened({ i: n, at });
    });
  };
  const remove = (i: number) => {
    setOpened(null);
    props.onInks?.(inks().filter((_, j) => j !== i));
    adder?.focus();
  };
  const tipAdd = tooltip(() => t("Add text color"));
  onSettled(() => {
    const away = pressOutside(
      () => [table],
      () => setHeld(null)
    );
    /* a hex is never cut: where the whole reading runs past the line (a phone, a language of longer words), the
       swatches stand for the hexes, and where even they do not fit, the numbers stand alone */
    const fit = new ResizeObserver(() => {
      const room = line.clientWidth;
      const whole = ruler.offsetWidth;
      const hexes = [...ruler.querySelectorAll<HTMLElement>("[data-hex]")].reduce(
        (sum, hex) => sum + hex.offsetWidth + space.s1,
        0
      );
      line.style.setProperty("--hexes", whole <= room ? "inline" : "none");
      line.style.setProperty("--pair", whole - hexes <= room ? "flex" : "none");
    });
    fit.observe(line);
    fit.observe(ruler);
    return () => {
      away();
      fit.disconnect();
    };
  });
  return (
    <div
      class={styles.whole}
      data-fill={props.fill ? "" : undefined}
      style={{ "--n": String(grounds().length), "--rows": String(rows().length) }}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: an ARIA grid walked by the arrows; a table's display would be changed */}
      <div
        ref={table}
        class={styles.grid}
        role="grid"
        aria-label={props["aria-label"]}
        dir="ltr"
        onKeyDown={walk}
        onPointerOver={e => {
          if (e.pointerType === "mouse") setHovered(cellOf(e.target));
        }}
        onPointerLeave={() => setHovered(null)}
        onPointerUp={e => {
          if (e.pointerType !== "mouse") setHeld(cellOf(e.target));
        }}
        onFocusIn={e => {
          const at = cellOf(e.target);
          setFocused(at);
          if (at) setTab(at);
        }}
        onFocusOut={e => {
          if (!cellOf(e.relatedTarget)) setFocused(null);
        }}
      >
        <For each={rows()} keyed={false}>
          {(row, i) => {
            const tip = tooltip(() => t("Change {hex}", { hex: row().hex }));
            const open = () => shown()?.i === row().mine;
            return (
              /* biome-ignore lint/a11y/useSemanticElements: a row of the grid above */
              /* biome-ignore lint/a11y/useFocusableInteractive: the grid's cells take the focus, not its rows */
              <div class={styles.row} role="row">
                {/* biome-ignore lint/a11y/useSemanticElements: the row's ink, in the grid above */}
                {/* biome-ignore lint/a11y/useFocusableInteractive: the grid's cells take the focus */}
                <span class={styles.ink} role="rowheader" aria-label={row().hex}>
                  <Show
                    when={row().mine !== undefined && props.onInks}
                    fallback={
                      <span
                        class={styles.coin}
                        style={{ background: row().paint }}
                        aria-hidden="true"
                      />
                    }
                  >
                    <button
                      ref={tip}
                      type="button"
                      class={styles.press}
                      data-mine={row().mine}
                      aria-label={t("Change {hex}", { hex: row().hex })}
                      aria-haspopup="dialog"
                      aria-expanded={open() ? "true" : "false"}
                      onClick={e =>
                        setOpened(open() ? null : { i: row().mine ?? 0, at: e.currentTarget })
                      }
                    >
                      <span
                        class={styles.coin}
                        data-press=""
                        data-open={open() ? "" : undefined}
                        style={{ background: row().paint }}
                      />
                    </button>
                  </Show>
                </span>
                <span
                  class={styles.cells}
                  data-first={i === 0 ? "" : undefined}
                  data-last={i === rows().length - 1 ? "" : undefined}
                  role="none"
                >
                  <For each={grounds()} keyed={false}>
                    {(ground, j) => {
                      const ratio = () => row().ratios[j] ?? 0;
                      /* both colors, their contrast and what it is enough for; an ink on its own color is 1 to 1 */
                      const says = () =>
                        t(
                          ratio() >= CONTRAST_TEXT
                            ? msg("{text} on {ground}: {ratio}, enough for text")
                            : ratio() >= CONTRAST_LARGE
                              ? msg("{text} on {ground}: {ratio}, large text only")
                              : msg("{text} on {ground}: {ratio}, too low for text"),
                          {
                            text: row().hex,
                            ground: ground().hex,
                            ratio: Math.floor((j === row().at ? 1 : ratio()) * 100) / 100
                          }
                        );
                      const lit = () => same(spot(), [i, j]);
                      return (
                        /* biome-ignore lint/a11y/useSemanticElements: a cell of the grid above */
                        /* biome-ignore lint/a11y/useFocusableInteractive: tabindex is written in Solid's lowercase */
                        <span
                          class={styles.cell}
                          role="gridcell"
                          data-cell=""
                          data-i={i}
                          data-j={j}
                          data-large={
                            ratio() >= CONTRAST_LARGE && ratio() < CONTRAST_TEXT ? "" : undefined
                          }
                          data-lit={lit() ? "" : undefined}
                          tabindex={same(tabbed(), [i, j]) ? 0 : -1}
                          aria-label={says()}
                          style={{
                            background: ground().paint ?? ground().hex,
                            color: row().paint,
                            "--edge":
                              withWhite(ground().hex) >= withBlack(ground().hex)
                                ? ON_DARK
                                : ON_LIGHT
                          }}
                        >
                          <Show when={ratio() >= CONTRAST_LARGE}>
                            <span aria-hidden="true">Aa</span>
                          </Show>
                        </span>
                      );
                    }}
                  </For>
                </span>
              </div>
            );
          }}
        </For>
      </div>
      <div class={styles.foot} dir="ltr">
        <span class={styles.lead}>
          <Show when={props.onInks}>
            <button
              ref={el => {
                adder = el;
                tipAdd(el);
              }}
              type="button"
              class={styles.press}
              aria-label={t("Add text color")}
              disabled={inks().length >= CONTRAST_MINE}
              onClick={add}
            >
              <span class={styles.plus}>
                <Icon name="plus" size={12} />
              </span>
            </button>
          </Show>
        </span>
        {/* the cells say all of this to a reader who listens; it reads in the page's direction, so a right-to-left
            reader meets the text color first, though the plus keeps to the coins' column */}
        <span ref={line} class={styles.line} dir={dir()} aria-hidden="true">
          <Show
            when={reading()}
            fallback={
              <>
                <span class={styles.key}>
                  <span class={styles.sample}>Aa</span>
                  {`${formatNumber(CONTRAST_TEXT)}:1`}
                </span>
                <span class={styles.key}>
                  <span class={styles.sample} data-large="">
                    Aa
                  </span>
                  {`${formatNumber(CONTRAST_LARGE)}:1`}
                </span>
              </>
            }
          >
            {r => (
              <>
                <span class={styles.pair}>{pairOf(r, false)}</span>
                {scoreOf(r)}
              </>
            )}
          </Show>
          <span ref={ruler} class={styles.ruler}>
            <Show when={reading()}>
              {r => (
                <>
                  <span class={styles.part}>{pairOf(r, true)}</span>
                  {scoreOf(r)}
                </>
              )}
            </Show>
          </span>
        </span>
      </div>
      {/* keyed: another coin's press stands up a picker of its own by that coin */}
      <Show when={shown()} keyed>
        {o => (
          <ColorPicker
            value={inks()[o.i] ?? ""}
            onInput={hex => change(o.i, hex)}
            anchor={o.at}
            onClose={() => setOpened(null)}
            end={
              <Button
                icon
                aria-label={t("Remove {hex}", { hex: inks()[o.i] ?? "" })}
                tip={t("Remove")}
                onClick={() => remove(o.i)}
              >
                <Icon name="trash" size={14} />
              </Button>
            }
          />
        )}
      </Show>
    </div>
  );
}
