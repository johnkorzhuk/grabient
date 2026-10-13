import { gradientCss } from "@grabient/engine/css.ts";
import type { Style } from "@grabient/engine/view.ts";
import { For, Show } from "solid-js";
import styles from "./CollectionCard.module.css";
import { PaletteCount } from "./CollectionGroup.tsx";
import { t } from "./i18n.ts";
import { Label } from "./Label.tsx";
import { Text } from "./Text.tsx";
import { tooltip } from "./Tooltip.tsx";

/** A tile of the mosaic: a palette's sampled stops, drawn in its style and angle. */
export interface MosaicPalette {
  stops: readonly string[];
  style?: Style;
  angle?: number;
}

/* The rows of a mosaic for a count: one up to three, two up to eight, three past that, as even as they can be with the
   fuller rows last. Twelve tiles at most. */
function mosaicRows(count: number): number[] {
  const n = Math.min(Math.max(Math.floor(count), 0), 12);
  if (!n) return [];
  const rows = n <= 3 ? 1 : n <= 8 ? 2 : 3;
  const base = Math.floor(n / rows);
  const extra = n % rows;
  return Array.from({ length: rows }, (_, i) => base + (i >= rows - extra ? 1 : 0));
}
/** The column span of each tile in twelfths, so every row fills its width. */
export const mosaicSpans = (count: number): number[] =>
  mosaicRows(count).flatMap(k => Array.from({ length: k }, () => 12 / k));

/** One collection in a list of collections, on a palette card's footprint: its first palettes as one picture the count
    always fills, and the card's line beneath, the title at the start and the count at the end. Its tooltip holds the
    description, the owner and the age. A blurred copy of the picture glows behind it under the pointer, and the seams
    between tiles are the page's own ground. */
export function CollectionCard(props: {
  /** where the collection lives, in the reader's language */
  href: string;
  title: string;
  description?: string;
  /** its first palettes, up to twelve */
  palettes: readonly MosaicPalette[];
  count: number;
  /** who made it: a display name, @username, or Grabient */
  owner: string;
  age: string;
  private?: boolean;
}) {
  const shown = () => props.palettes.slice(0, 12);
  const rows = () => ({
    "grid-template-rows": `repeat(${Math.max(1, mosaicRows(shown().length).length)}, minmax(0, 1fr))`
  });
  const tiles = () => {
    const spans = mosaicSpans(shown().length);
    return (
      <For each={shown()} keyed={false}>
        {(palette, i) => (
          <span
            class={styles.tile}
            style={{
              background: gradientCss(palette().stops, palette().style, palette().angle),
              "grid-column": `span ${spans[i] ?? 12}`
            }}
          />
        )}
      </For>
    );
  };
  return (
    <article class={styles.card}>
      <div class={styles.art}>
        <div class={styles.grid} data-glow="" style={rows()} aria-hidden="true">
          {tiles()}
        </div>
        <a
          class={styles.grid}
          href={props.href}
          style={rows()}
          aria-label={t("Open {title}", { title: props.title })}
        >
          {tiles()}
        </a>
      </div>
      <div class={styles.meta}>
        <a
          class={styles.title}
          href={props.href}
          dir="auto"
          ref={tooltip(() =>
            [props.description, `${props.owner} · ${props.age}`].filter(Boolean).join("\n")
          )}
        >
          <Text variant="h3" as="span">
            {props.title}
          </Text>
        </a>
        <span class={styles.facts}>
          <Show when={props.private}>
            <Label>{t("Private")}</Label>
          </Show>
          <PaletteCount count={props.count} />
        </span>
      </div>
    </article>
  );
}
