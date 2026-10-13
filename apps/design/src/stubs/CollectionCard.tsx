/* A stand-in for @grabient/ui/CollectionCard.tsx until the design system lands it, with grabient4's name and props:
   its first palettes as one mosaic the count fills (a row up to three, two to eight, three past that), then its title
   and how many it holds. Deleted at the merge. */
import { gradientCss } from "@grabient/engine/css.ts";
import { Text } from "@grabient/ui/Text.tsx";
import { For } from "solid-js";
import styles from "./CollectionCard.module.css";

export function CollectionCard(props: {
  href: string;
  title: string;
  description?: string;
  palettes: readonly (readonly string[])[];
  count: number;
  owner: string;
  age: string;
  private?: boolean;
}) {
  const shown = () => props.palettes.slice(0, 12);
  const spans = () => {
    const n = shown().length;
    const rows = n <= 3 ? 1 : n <= 8 ? 2 : 3;
    const base = Math.floor(n / rows);
    const extra = n % rows;
    return Array.from({ length: rows }, (_, r) => base + (r >= rows - extra ? 1 : 0)).flatMap(k =>
      Array.from({ length: k }, () => 12 / k)
    );
  };
  return (
    <article class={styles.card}>
      <a class={styles.mosaic} href={props.href} aria-label={props.title}>
        <For each={shown()}>
          {(stops, i) => (
            <span
              class={styles.tile}
              style={{ background: gradientCss(stops), "grid-column": `span ${spans()[i()]}` }}
            />
          )}
        </For>
      </a>
      <div class={styles.meta}>
        <Text variant="h3" as="span" truncate>
          {props.title}
        </Text>
        <Text variant="small">{`${props.count} palettes`}</Text>
      </div>
    </article>
  );
}
