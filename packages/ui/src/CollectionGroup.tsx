import { rich } from "@grabient/i18n";
import { type Element, For, Show } from "solid-js";
import styles from "./CollectionGroup.module.css";
import { Icon, type IconName } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { Label } from "./Label.tsx";
import { PaletteGrid } from "./PaletteGrid.tsx";
import { PaletteCardPlaceholder } from "./PalettePlaceholder.tsx";
import { Placeholder } from "./Placeholder.tsx";
import { Text } from "./Text.tsx";
import { tooltip } from "./Tooltip.tsx";

/* two rows of the grid's columns, or three cards on a phone */
const CAP = [3, 4, 6, 8, 10, 12];
/** How many cards a group shows at a column count. */
export const shownAt = (columns: number, count: number) =>
  Math.min(CAP[Math.min(Math.max(columns, 1), CAP.length) - 1]!, Math.max(0, count));

/** A palette count, its digits and its word each in their own type, in the order the language gives them. */
export function PaletteCount(props: { count: number }) {
  return (
    <span class={styles.count}>
      {rich(
        "{count, plural, one {<n>#</n> <w>palette</w>} other {<n>#</n> <w>palettes</w>}}",
        {
          n: digits => <Text variant="num">{digits}</Text>,
          w: words => <Text variant="ui">{words}</Text>
        },
        { count: props.count }
      )}
    </span>
  );
}

/** One collection in a feed: its title line, then its first palettes as the list's own cards. The title links to the
    collection, and its tooltip holds the description, the owner and the age; the count and Private stand at the right.
    The grid shows two rows of its columns, three cards on a phone; cards past that stay in the document, hidden by
    width, so the server and the browser draw the same page. */
export function CollectionGroup<T>(props: {
  title: string;
  /** where the collection lives, in the reader's language; without it the title is plain words */
  href?: string;
  /** the title link's relation to its page: nofollow where the index keeps it out */
  rel?: string;
  /** a glyph after the linked title, where the press it stands for elsewhere is the same: the magnifier of Similar
      palettes */
  icon?: IconName;
  description?: string;
  /** who made it: a display name, @username, or Grabient */
  owner?: string;
  /** how old, as a list says it */
  age?: string;
  count?: number;
  /** a private collection, its owner's alone */
  private?: boolean;
  /** the palettes to draw, in order */
  palettes: readonly T[];
  /** the card for a palette, with the accessor the grid hands out, so a changed list redraws in place */
  card: (palette: () => T, index: number) => Element;
  /** the palettes are the whole list, not a collection's first: every one shows at every width */
  whole?: boolean;
  /** the pointer or the keyboard reached the title: the page may read the collection now */
  onIntent?: () => void;
}) {
  const words = () =>
    [props.description, [props.owner, props.age].filter(Boolean).join(" · ")]
      .filter(Boolean)
      .join("\n");
  return (
    <section class={styles.group} aria-label={props.title}>
      <div class={styles.head}>
        {/* the title at the size its own page gives it, so opening the collection changes nothing about its name */}
        <Text variant="title" as="h2" dir="auto" truncate>
          <Show when={props.href} fallback={props.title}>
            <a
              class={styles.title}
              href={props.href}
              rel={props.rel}
              ref={tooltip(words)}
              onPointerEnter={() => props.onIntent?.()}
              onFocus={() => props.onIntent?.()}
            >
              <span class={styles.words}>{props.title}</span>
              <Show when={props.icon}>
                {icon => (
                  <span class={styles.mark}>
                    <Icon name={icon()} size={24} />
                  </span>
                )}
              </Show>
            </a>
          </Show>
        </Text>
        <span class={styles.facts}>
          <Show when={props.private}>
            <Label>{t("Private")}</Label>
          </Show>
          <Show when={props.count !== undefined}>
            <PaletteCount count={props.count!} />
          </Show>
        </span>
      </div>
      <PaletteGrid>
        <For each={props.palettes} keyed={false}>
          {(palette, i) => (
            <div class={styles.cell} data-whole={props.whole ? "" : undefined}>
              {props.card(palette, i)}
            </div>
          )}
        </For>
      </PaletteGrid>
    </section>
  );
}

/** A group on its way: the line and two rows of cards at the sizes the collection will take, so the feed has its
    shape already. */
export function CollectionGroupPlaceholder(props: { count?: number }) {
  const cards = () =>
    Array.from({ length: Math.min(12, Math.max(1, props.count ?? 12)) }, (_, i) => i);
  return (
    <section class={styles.group} aria-hidden="true">
      <div class={styles.head}>
        <Placeholder width="260px" height="24px" />
        <Placeholder width="72px" />
      </div>
      <PaletteGrid>
        <For each={cards()} keyed={false}>
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
