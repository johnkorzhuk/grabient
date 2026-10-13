import { Text } from "@grabient/ui/Text.tsx";
import { For } from "solid-js";
import styles from "./Pins.module.css";

/** A numbered pin centered on a point of its positioned host. */
export function Pin(props: { n: number; left: string; top: string }) {
  return (
    <span class={styles.pin} style={{ left: props.left, top: props.top }} aria-hidden="true">
      <Text variant="num">{props.n}</Text>
    </span>
  );
}

/** What each pin marks, numbered from one. */
export function Legend(props: { labels: readonly string[] }) {
  return (
    <ol class={styles.legend}>
      <For each={props.labels}>
        {(label, i) => (
          <li class={styles.item}>
            <span class={styles.number} aria-hidden="true">
              <Text variant="num">{i() + 1}</Text>
            </span>
            <Text variant="small">{label}</Text>
          </li>
        )}
      </For>
    </ol>
  );
}
