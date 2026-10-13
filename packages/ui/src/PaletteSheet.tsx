import { children, createUniqueId, type Element, For, onSettled, Show } from "solid-js";
import { ContrastGrid, type GridColor } from "./ContrastGrid.tsx";
import { FigurePane } from "./FigurePane.tsx";
import { Icon } from "./Icon.tsx";
import { localHref, t } from "./i18n.ts";
import link from "./link.module.css";
import { type CodeSource, PaletteCode } from "./PaletteCode.tsx";
import styles from "./PaletteSheet.module.css";
import { Rule } from "./Rule.tsx";
import { Text } from "./Text.tsx";

/* The editor's sheet: what a reader scrolls beside the side that keeps the controls in the window, under the picture
   and its strip. Its head is the palette's name, the row that shows under the first screen at rest, with the palette's
   own presses at the line's end (away while the picture carries them); under it a line kept for the collections that
   hold the palette, there or not, so one coming or going moves nothing. Then its figures as panes of one frame, each
   given the shape of what it draws: the text that reads on its colors, its path through the color solid, and its code.
   On a large screen the three stand in a row; where the code has no room beside the path it goes under; on a phone
   they stand one under another and there is no code. Then, past a rule, the palettes like this one as a list draws
   them, and the site's footer. Its own matter is on solid paper; the palettes are on paper while the picture may stand
   behind them and on glass once it is out of sight (`clear`), so a lit card's light shows in the water. */
export function PaletteSheet(props: {
  /** the palette's title, the page's name: a written one reads in its author's direction */
  title: string;
  /** the palette's own presses: its heart, its place in the selection */
  actions?: Element;
  /** the first screen stands and the picture carries those presses: the sheet's are away */
  resting?: boolean;
  /** the collections that hold the palette, each with up to five of its colors; one with no href cannot be reached now */
  collections: readonly { title: string; href?: string; colors?: readonly string[] }[];
  /** the order of the palettes like this one, at the start of their row */
  order?: Element;
  /** the selection's press, at the row's end; a phone floats its own */
  selection?: Element;
  /** the palette as text; a phone's sheet shows none of it */
  sources: readonly CodeSource[];
  onCopy?: (id: string, text: string, spelling?: string) => void;
  /** the picture's colors, in order */
  colors: readonly GridColor[];
  /** what copies and saves the contrast as a picture, at its name's end */
  contrastCopies?: Element;
  /** the reader's own text colors, as hex */
  inks?: readonly string[];
  onInks?: (inks: string[]) => void;
  /** the palette's path through the color solid, in its pane (a SolidPane) */
  solid?: Element;
  /** the palettes like this one, as the page draws them */
  children?: Element;
  /** the site's footer */
  foot?: Element;
  /** the page's picture is out of sight: the palettes are on glass */
  clear?: boolean;
  /** how far under the sheet's top the name's row ends: what the page shows under its first screen */
  onBand?: (height: number) => void;
  ref?: (el: HTMLElement) => void;
}) {
  const titleId = createUniqueId();
  let sheet!: HTMLElement;
  let name!: HTMLDivElement;
  /* a slot is its parent's expression and makes its content anew on every read: each is made once */
  const actions = children(() => props.actions);
  const order = children(() => props.order);
  const selection = children(() => props.selection);
  const copies = children(() => props.contrastCopies);
  const solid = children(() => props.solid);
  const foot = children(() => props.foot);
  /* a long name takes a second line and its row grows: the page is told, so its first screen ends on the row */
  onSettled(() => {
    const tell = props.onBand;
    if (!tell) return;
    const read = () =>
      tell(Math.round(name.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top));
    const sizes = new ResizeObserver(read);
    sizes.observe(name);
    read();
    return () => sizes.disconnect();
  });
  return (
    <section
      ref={el => {
        sheet = el;
        props.ref?.(el);
      }}
      class={styles.sheet}
      aria-labelledby={titleId}
    >
      <div class={[styles.bleed, styles.top]}>
        <div class={styles.head}>
          <div ref={name} class={styles.name}>
            <Text variant="title" id={titleId} dir="auto">
              {props.title}
            </Text>
          </div>
          <Show when={actions()}>
            <div
              class={styles.takes}
              data-away={props.resting ? "" : undefined}
              inert={props.resting}
            >
              {/* biome-ignore lint/a11y/useSemanticElements: the palette's presses, which a fieldset would box */}
              <div class={styles.actions} role="group" aria-label={t("Palette actions")}>
                {actions()}
              </div>
            </div>
          </Show>
          <Show when={props.collections.length}>
            <nav class={styles.links} aria-label={t("In these collections")}>
              <span class={styles.glyph} aria-hidden="true">
                <Icon name="collection" size={14} />
              </span>
              <For each={props.collections} keyed={false}>
                {c => (
                  <span class={styles.link} data-off={c().href ? undefined : ""}>
                    <Text variant="ui" truncate>
                      <a
                        class={link.inline}
                        href={c().href ? localHref(c().href) : undefined}
                        aria-disabled={c().href ? undefined : "true"}
                        dir="auto"
                      >
                        {c().title}
                      </a>
                    </Text>
                    <span class={styles.coins} aria-hidden="true">
                      <For each={(c().colors ?? []).slice(0, 5)} keyed={false}>
                        {hex => <span class={styles.coin} style={{ background: hex() }} />}
                      </For>
                    </span>
                  </span>
                )}
              </For>
            </nav>
          </Show>
        </div>
        <div class={styles.figures} data-flat={solid() ? undefined : ""}>
          <Show when={props.colors.length}>
            <div class={styles.reads}>
              <FigurePane name={t("Text contrast")} stretch aside={copies()}>
                <div class={styles.readsFit}>
                  <ContrastGrid
                    fill
                    colors={props.colors}
                    aria-label={t("Text contrast")}
                    inks={props.inks}
                    onInks={props.onInks}
                  />
                </div>
              </FigurePane>
            </div>
          </Show>
          <Show when={solid()}>
            <div class={styles.solid}>
              <div class={styles.solidFit}>{solid()}</div>
            </div>
          </Show>
          <div class={styles.code}>
            <div class={styles.codeFit}>
              <div class={styles.codeIn}>
                <PaletteCode fill sources={props.sources} initial="seed" onCopy={props.onCopy} />
              </div>
            </div>
          </div>
        </div>
        <div class={styles.rule}>
          <Rule />
        </div>
      </div>
      <div
        class={[styles.bleed, styles.rest]}
        data-clear={props.clear ? "" : undefined}
        data-footed={foot() ? "" : undefined}
      >
        <div class={styles.list}>
          <Show when={order() || selection()}>
            <div class={styles.row}>
              <Show when={order()}>
                <div class={styles.track}>{order()}</div>
              </Show>
              <Show when={selection()}>
                <div class={styles.end}>{selection()}</div>
              </Show>
            </div>
          </Show>
          {props.children}
        </div>
        {foot()}
      </div>
    </section>
  );
}
