import { type Element, For, Show } from "solid-js";
import styles from "./CollectionGroup.module.css";
import { t } from "./i18n.ts";
import { Label } from "./Label.tsx";
import { PaletteGrid } from "./PaletteGrid.tsx";
import { PaletteCardPlaceholder } from "./PalettePlaceholder.tsx";
import { Placeholder } from "./Placeholder.tsx";
import { Text } from "./Text.tsx";
import { tooltip } from "./Tooltip.tsx";

/** How many cards a group shows at a column count: two rows, or three cards on a phone. The same ranges as its
    styles, so an estimate and the page agree. */
const CAP = [3, 4, 6, 8, 10, 12];
export const shownAt = (columns: number, count: number): number =>
  Math.min(CAP[Math.min(Math.max(columns, 1), CAP.length) - 1]!, Math.max(0, count));

/** One collection in a feed: its title line, then its first palettes on the list's own grid as the list's own cards.
    The title leads to the collection, and its tooltip holds the description, the owner and the age; the count and
    Private stand at the end. Two rows of the grid's columns show, three cards on a phone; the cards past them stay
    drawn and hidden by width, so the server and the browser draw the same group at any width. */
export function CollectionGroup<T>(props: {
  title: string;
  /** the collection's page, in the reader's language */
  href: string;
  description?: string;
  owner?: string;
  age?: string;
  count: number;
  private?: boolean;
  palettes: readonly T[];
  card: (palette: () => T) => Element;
}) {
  const tip = tooltip(() =>
    [props.description, [props.owner, props.age].filter(Boolean).join(" · ")]
      .filter(Boolean)
      .join("\n")
  );
  return (
    <section class={styles.group} aria-label={props.title}>
      <div class={styles.head}>
        <Text variant="h2" truncate dir="auto">
          <a ref={tip} class={styles.title} href={props.href}>
            {props.title}
          </a>
        </Text>
        <span class={styles.end}>
          <Show when={props.private}>
            <Label>{t("Private")}</Label>
          </Show>
          <span class={styles.count}>
            {t("{count, plural, one {# palette} other {# palettes}}", { count: props.count })}
          </span>
        </span>
      </div>
      <PaletteGrid>
        <For each={props.palettes} keyed={false}>
          {palette => <div class={styles.cell}>{props.card(palette)}</div>}
        </For>
      </PaletteGrid>
    </section>
  );
}

/** A group on its way: the title line and two rows of cards at the sizes the collection will take. */
export function CollectionGroupPlaceholder() {
  return (
    <section class={styles.group} aria-hidden="true">
      <div class={styles.head}>
        <Placeholder width="260px" height="24px" />
        <Placeholder width="72px" />
      </div>
      <PaletteGrid>
        <For each={Array.from({ length: 12 }, (_, i) => i)}>
          {() => (
            <div class={styles.cell}>
              <PaletteCardPlaceholder />
            </div>
          )}
        </For>
      </PaletteGrid>
    </section>
  );
}
