import { t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { copyText } from "@grabient/ui/copy.ts";
import { Text } from "@grabient/ui/Text.tsx";
import { createEffect, For } from "solid-js";
import styles from "./collections.module.css";

/** One palette of a collection as its list of hex codes says it. */
export interface CodeRow {
  /** the palette as the collection holds it: its seed and view */
  key: string;
  /** what its card calls it: the collection's own title, else the title written for it, else its colors' name */
  name: string;
  /** where its card's Edit leads: its page, in the view and the look the card shows it in */
  href: string;
  rel?: string;
  /** its own colors, one to a keyframe, as the collection's sheet shows them */
  hexes: readonly string[];
}

const CHIP = "button[data-hex]";
/** How long a copied code says so. */
const SAID_MS = 1100;

/** A row's codes as markup: a press a color, its coin drawn from `--c`. One string a row, which names nothing but its
    colors, so a list of hundreds of codes is no hundreds of nodes to hydrate and a row keeps its buttons, and the
    focus in them, while the rows about it come and go. */
const chips = (hexes: readonly string[]): string =>
  hexes
    .map(
      hex =>
        `<button type="button" tabindex="-1" data-hex="${hex}" style="--c:${hex}" aria-label="${t("Copy {hex}", { hex }).replaceAll('"', "&quot;")}">${hex}</button>`
    )
    .join("");

/** A public collection's palettes as their hex codes, under its files: a row a palette, by the name its card gives it
    and a link where the card's Edit leads, then its own colors, one to a keyframe as its sheet shows them, each a
    coin and its code. A press copies a code, which says Copied over itself for a moment, in the reader's language,
    and nothing moves. The codes are the page's words too: a search for a theme's colors reads them here, where the
    cards above draw them as pictures. One Tab stop however many codes, on the code focused last, or the first: the
    arrows walk the codes, up and down a palette at a time, Home and End to the ends. Codes run left to right in
    every language, as a palette's colors do. */
export function HexCodes(props: { rows: readonly CodeRow[] }) {
  let list!: HTMLOListElement;
  const all = () => [...list.querySelectorAll<HTMLElement>(CHIP)];
  /* the one code Tab reaches: `to`, and no other */
  const hold = (to: HTMLElement | undefined) => {
    for (const chip of list.querySelectorAll<HTMLElement>(`${CHIP}[tabindex="0"]`))
      if (chip !== to) chip.tabIndex = -1;
    if (to) to.tabIndex = 0;
  };
  /* rows come and go under an owner's hands and an order's change: whatever is drawn, one code holds the stop, the
     one that held it while it stands */
  createEffect(
    () => props.rows,
    () => hold(list.querySelector<HTMLElement>(`${CHIP}[tabindex="0"]`) ?? all()[0])
  );
  const said = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const press = async (e: MouseEvent) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>(CHIP);
    if (!chip?.dataset.hex) return;
    if (!(await copyText(chip.dataset.hex))) {
      announce(t("Couldn't copy. Select the text and copy it."));
      return;
    }
    announce(t("Copied"));
    /* said where the reader is looking: over the code itself, which stands as it was under it */
    chip.dataset.said = t("Copied");
    clearTimeout(said.get(chip));
    said.set(
      chip,
      setTimeout(() => {
        delete chip.dataset.said;
        said.delete(chip);
      }, SAID_MS)
    );
  };
  /* the arrows: a code left or right, a palette up or down at the same place along it, Home and End to the ends. A
     key held with Alt, Ctrl or the command key is the browser's own (Back, the page's top) */
  const walk = (e: KeyboardEvent) => {
    const at = (e.target as HTMLElement).closest<HTMLElement>(CHIP);
    if (!at || e.altKey || e.ctrlKey || e.metaKey) return;
    const within = (row?: Element | null) => [...(row?.querySelectorAll<HTMLElement>(CHIP) ?? [])];
    const codes = all();
    const row = at.closest("li");
    const beside = (other?: Element | null) => {
      const others = within(other);
      return others[Math.min(within(row).indexOf(at), others.length - 1)];
    };
    const ways: Record<string, () => HTMLElement | undefined> = {
      ArrowRight: () => codes[codes.indexOf(at) + 1],
      ArrowLeft: () => codes[codes.indexOf(at) - 1],
      ArrowDown: () => beside(row?.nextElementSibling),
      ArrowUp: () => beside(row?.previousElementSibling),
      Home: () => codes[0],
      End: () => codes.at(-1)
    };
    if (!Object.hasOwn(ways, e.key)) return;
    e.preventDefault();
    ways[e.key]()?.focus();
  };
  return (
    <section class={styles.codes} aria-labelledby="collection-codes">
      <Text variant="h2" as="h2" id="collection-codes">
        {t("Hex codes")}
      </Text>
      {/* the list hears its codes' presses, keys and focus, each code a button of its own: the code that takes the
          focus, by a key or a press, takes the Tab stop with it */}
      <ol
        ref={list}
        class={styles.codeList}
        onClick={e => void press(e)}
        onKeyDown={walk}
        onFocusIn={e => {
          const chip = (e.target as HTMLElement).closest<HTMLElement>(CHIP);
          if (chip) hold(chip);
        }}
      >
        <For each={props.rows} keyed={row => row.key}>
          {row => (
            <li class={styles.codeRow}>
              <a class={styles.inline} href={row().href} rel={row().rel}>
                {row().name}
              </a>
              <span class={styles.chips} innerHTML={chips(row().hexes)} />
            </li>
          )}
        </For>
      </ol>
    </section>
  );
}
