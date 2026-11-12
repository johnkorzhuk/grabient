import { t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { copyText } from "@grabient/ui/copy.ts";
import { Text } from "@grabient/ui/Text.tsx";
import { For } from "solid-js";
import styles from "./collections.module.css";

/** One palette of a collection as its list of hex codes says it. */
export interface CodeRow {
  /** the palette as the collection holds it: its seed and view */
  key: string;
  /** what the collection calls it, else the title written for it, else what its colors call it */
  name: string;
  /** its page, in the view the collection saved it in */
  href: string;
  rel?: string;
  /** its own colors, one to a keyframe, as the collection's sheet shows them */
  hexes: readonly string[];
}

const CHIP = "button[data-hex]";

/** A row's codes as markup: a press a color, its coin drawn from `--c`. One string a row, so a list of hundreds of
    codes is no hundreds of nodes to hydrate. The list's first code alone takes the Tab key; the arrows walk the
    rest. */
const chips = (hexes: readonly string[], first: boolean): string =>
  hexes
    .map(
      (hex, i) =>
        `<button type="button" tabindex="${first && i === 0 ? 0 : -1}" data-hex="${hex}" style="--c:${hex}" aria-label="${t("Copy {hex}", { hex }).replaceAll('"', "&quot;")}">${hex}</button>`
    )
    .join("");

/** A public collection's palettes as their hex codes, under its files: a row a palette, by the name its card gives it
    and a link to its page, then its own colors, one to a keyframe as its sheet shows them, each a coin and its code.
    A press copies a code. The codes are the page's words too: a search for a theme's colors reads them here, where
    the cards above draw them as pictures. One Tab stop however many codes, on the code focused last: the arrows walk
    the codes, up and down a palette at a time, Home and End to the ends. Codes run left to right in every language,
    as a palette's colors do. */
export function HexCodes(props: {
  rows: readonly CodeRow[];
  /** a code was copied: the page's line says so */
  onCopied: () => void;
}) {
  let list!: HTMLOListElement;
  const press = async (e: MouseEvent) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>(CHIP);
    if (!chip?.dataset.hex) return;
    if (await copyText(chip.dataset.hex)) {
      announce(t("Copied"));
      props.onCopied();
    } else announce(t("Couldn't copy. Select the text and copy it."));
  };
  /* the arrows: a code left or right, a palette up or down at the same place along it, Home and End to the ends */
  const walk = (e: KeyboardEvent) => {
    const at = (e.target as HTMLElement).closest<HTMLElement>(CHIP);
    if (!at) return;
    const within = (row?: Element | null) => [...(row?.querySelectorAll<HTMLElement>(CHIP) ?? [])];
    const all = within(list);
    const row = at.closest("li");
    const beside = (other?: Element | null) => {
      const chips = within(other);
      return chips[Math.min(within(row).indexOf(at), chips.length - 1)];
    };
    const ways: Record<string, () => HTMLElement | undefined> = {
      ArrowRight: () => all[all.indexOf(at) + 1],
      ArrowLeft: () => all[all.indexOf(at) - 1],
      ArrowDown: () => beside(row?.nextElementSibling),
      ArrowUp: () => beside(row?.previousElementSibling),
      Home: () => all[0],
      End: () => all.at(-1)
    };
    if (!Object.hasOwn(ways, e.key)) return;
    e.preventDefault();
    const to = ways[e.key]();
    if (!to || to === at) return;
    at.tabIndex = -1;
    to.tabIndex = 0;
    to.focus();
  };
  return (
    <section class={styles.codes} aria-labelledby="collection-codes">
      <Text variant="h2" as="h2" id="collection-codes">
        {t("Hex codes")}
      </Text>
      {/* the list hears its codes' presses and keys, each code a button of its own */}
      <ol ref={list} class={styles.codeList} onClick={e => void press(e)} onKeyDown={walk}>
        <For each={props.rows} keyed={row => row.key}>
          {(row, i) => (
            <li class={styles.codeRow}>
              <a class={styles.inline} href={row().href} rel={row().rel}>
                {row().name}
              </a>
              <span class={styles.chips} innerHTML={chips(row().hexes, i() === 0)} />
            </li>
          )}
        </For>
      </ol>
    </section>
  );
}
