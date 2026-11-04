import { gradientCss } from "@grabient/engine/css.ts";
import type { Style } from "@grabient/engine/view.ts";
import { createMemo, createSignal, type Element, For, onSettled, Show, untrack } from "solid-js";
import { keepKeyboard } from "./dismiss.ts";
import styles from "./ExportPreview.module.css";
import { type ExportSettings, exportLayout } from "./exportgrid.ts";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { watchSize } from "./measure.ts";
import { tooltip } from "./Tooltip.tsx";
import { size } from "./tokens.ts";

/** One palette of the selection, as the preview draws it. */
export interface PreviewItem {
  id: string;
  /** what its colors call it, which its press says */
  name: string;
  stops: readonly string[];
  style: Style;
  angle: number;
  /** each stop's place along the line, where the view is soft: the stops are its blurred ones (engine/soft.ts) */
  at?: readonly number[];
  /** the grain over the picture: one tile at full strength as a CSS image, at the grain's opacity */
  grain?: { image: string; opacity: number };
  /** what it shows in its gradient's place: an effect's still, which never moves here */
  picture?: () => Element;
  /** that picture's blur, its deviation a share of the cell's longer side (engine/view.ts effectSoftShare) */
  blur?: number;
  /** what a blurred picture's edges thin to, a CSS background: none where it stands with no ground of its own */
  under?: string;
}

/* The selection as its image will be: the grid exportLayout describes, each palette at its size in its own style and
   angle with the corners, or the still of the effect it plays, its soft and grain over it as a list's card lays them,
   on a clear ground, scaled down to the room it is given and never up, nor below a target's size a cell, where the
   room scrolls. Every cell is a way out of the selection, named for its palette, with a minus at its middle where
   there is room for one; the keyboard on the last one taken out goes to the one before it. Left to right in every
   language, as the file runs. */
export function ExportPreview(props: {
  items: readonly PreviewItem[];
  settings: ExportSettings;
  /** a seed route: what Auto is, the artwork's own measured size */
  autoSize?: { width: number; height: number };
  /** takes one out: every cell is that press */
  onRemove?: (id: string) => void;
}) {
  let host!: HTMLDivElement;
  let grid!: HTMLDivElement;
  const [room, setRoom] = createSignal({ width: 0, height: 0 });
  onSettled(() =>
    watchSize(host, () => setRoom({ width: host.clientWidth, height: host.clientHeight }))
  );
  const layout = createMemo(() => exportLayout(props.items.length, props.settings, props.autoSize));
  /* a cell keeps a target's side on every pointer: past it the picture is drawn no smaller, and its room scrolls. A
     finger's side would hide most of a phone's picture from about twenty palettes */
  const k = createMemo(() => {
    const d = layout().dims;
    const c = layout().cell;
    const r = room();
    if (!r.width || !r.height) return 0;
    const fit = Math.min(1, r.width / Math.max(1, d.width), r.height / Math.max(1, d.height));
    return Math.max(fit, Math.min(1, size.target / Math.max(1, Math.min(c.w, c.h))));
  });
  const px = (v: number) => `${Math.max(0, v * k())}px`;
  const cell = () => layout().cell;
  /* whether a cell has room for its minus: one answer for all of them */
  const roomy = createMemo(() => cell().w * k() >= 40 && cell().h * k() >= 30);
  return (
    <div ref={host} class={styles.host}>
      <Show when={k() > 0}>
        {/* biome-ignore lint/a11y/useSemanticElements: the picture's cells, each a press, which a fieldset would box */}
        <div
          class={styles.ground}
          dir="ltr"
          role="group"
          aria-label={t("Export preview")}
          style={{ width: px(layout().dims.width), height: px(layout().dims.height) }}
        >
          <div
            ref={grid}
            class={styles.grid}
            style={{
              padding: px(layout().padding),
              gap: px(layout().gap),
              "grid-template-columns": `repeat(${layout().cols}, ${px(cell().w)})`,
              "grid-auto-rows": px(cell().h),
              "--corner": px(
                (Math.min(cell().w, cell().h) * Math.min(50, props.settings.corners)) / 100
              )
            }}
          >
            {/* a cell follows its palette, so a picture drawn stays drawn as others come and go */}
            <For each={props.items} keyed={item => item.id}>
              {item => {
                const tip = tooltip(() => t("Remove from selection"));
                return (
                  <button
                    ref={tip}
                    type="button"
                    class={styles.cell}
                    style={{
                      background: item().picture
                        ? item().under
                        : gradientCss(
                            item().stops,
                            item().style,
                            item().angle,
                            undefined,
                            item().at
                          ),
                      "--fx-blur":
                        item().picture && item().blur
                          ? `blur(${((item().blur ?? 0) * 100).toFixed(3)}cqmax)`
                          : undefined
                    }}
                    aria-label={t("Remove {name} from selection", { name: item().name })}
                    onClick={() =>
                      keepKeyboard(
                        () => props.onRemove?.(item().id),
                        () => grid.querySelector<HTMLElement>("button:last-child")
                      )
                    }
                  >
                    {/* made once: the cell's palette and look are its own for as long as it stands */}
                    <Show when={item().picture}>
                      {picture => <span class={styles.picture}>{untrack(() => picture()())}</span>}
                    </Show>
                    <Show when={item().grain}>
                      {grain => (
                        <span
                          class={styles.grain}
                          style={{
                            "background-image": grain().image,
                            opacity: String(grain().opacity)
                          }}
                          aria-hidden="true"
                        />
                      )}
                    </Show>
                    <Show when={roomy()}>
                      <span class={styles.minus} aria-hidden="true">
                        <Icon name="minus" size={12} />
                      </span>
                    </Show>
                  </button>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </div>
  );
}
