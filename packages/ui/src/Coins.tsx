import { For } from "solid-js";
import styles from "./Coins.module.css";

/* A search's or a collection's colors as coins, one to five, seen only under the pointer or the keyboard focus of what
   they belong to: the element that wears `coinHost`. Under a tag they stand in their own faint light, under a link
   they are smaller, and at a row's end they keep their room, so what follows them stands where it does with or without
   them. Every place that shows a tag's or a collection's colors draws them here. */

/** The class of the element whose pointer or keyboard focus opens its coins. On it, `data-open` holds them open (the
    design document) and `data-quiet` keeps them shut (a tag or a link that leads nowhere now). */
export const coinHost = styles.host;

/** The most colors a tag, a link or a row opens. */
const MOST = 5;

export function Coins(props: {
  colors?: readonly string[];
  /** under a tag, in their light; under a link; or at a row's end, in its flow */
  variant?: "tag" | "link" | "row";
}) {
  const shown = () => (props.colors ?? []).slice(0, MOST);
  const light = () =>
    shown().length > 1 ? `linear-gradient(90deg, ${shown().join(", ")})` : shown()[0];
  return (
    <span
      class={styles.coins}
      data-coins={props.variant ?? "link"}
      style={props.variant === "tag" ? { "--light": light() } : undefined}
      aria-hidden="true"
    >
      <For each={shown()} keyed={false}>
        {(hex, i) => {
          // how far from the middle coin: where it starts from, and its turn to open
          const from = () => i - (shown().length - 1) / 2;
          return (
            <span
              class={styles.coin}
              style={{ background: hex(), "--i": String(from()), "--d": String(Math.abs(from())) }}
            />
          );
        }}
      </For>
    </span>
  );
}
