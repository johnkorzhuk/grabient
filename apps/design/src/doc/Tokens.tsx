import { Text } from "@grabient/ui/Text.tsx";
import { theme } from "@grabient/ui/theme.ts";
import { For } from "solid-js";
import styles from "./Tokens.module.css";
import { colorValue, type Paint, paintOf, tokenValue } from "./tokens.ts";

/** The tokens a foundation governs that its specimens do not draw as a scale: each by its name, a color by what it
    paints in the page's theme, the rest by value. */
export function Tokens(props: { paths: readonly string[] }) {
  return (
    <ul class={styles.tokens}>
      <For each={props.paths}>
        {path => {
          const paint = path.startsWith("color.") ? (path.slice(6) as Paint) : null;
          return (
            <li class={styles.token}>
              {paint && <span class={styles.swatch} style={paintOf(paint)} />}
              <Text variant="mono" strong>
                {path}
              </Text>
              <Text variant="mono">{paint ? colorValue(paint, theme()) : tokenValue(path)}</Text>
            </li>
          );
        }}
      </For>
    </ul>
  );
}
