/* A stand-in for @grabient/ui/Tags.tsx until the design system lands it, with grabient4's name and props: the lead,
   then one row of tags, each opening its colors under the pointer or focus (`open` holds one open, `state` holds them
   all in a state). Deleted at the merge. */
import { Button } from "@grabient/ui/Button.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { For, Show } from "solid-js";
import styles from "./Tags.module.css";

export interface Tag {
  label: string;
  colors?: readonly string[];
  href?: string;
  disabled?: boolean;
}

export function Tags(props: {
  lead?: string;
  tags: readonly Tag[];
  onPick?: (tag: Tag, index: number) => void;
  open?: number;
  state?: "hover" | "focus" | "pressed";
}) {
  return (
    <div role="toolbar" class={styles.row} aria-label="Tags">
      <Show when={props.lead}>{lead => <Text variant="small">{lead()}</Text>}</Show>
      <For each={props.tags}>
        {(tag, i) => (
          <span class={styles.tag} data-open={props.open === i() || props.state ? "" : undefined}>
            <Button
              size="sm"
              state={props.state}
              disabled={tag.disabled}
              onClick={() => props.onPick?.(tag, i())}
            >
              {tag.label}
            </Button>
            <span class={styles.coins} aria-hidden="true">
              <For each={tag.colors ?? []}>
                {color => <span class={styles.coin} style={{ background: color }} />}
              </For>
            </span>
          </span>
        )}
      </For>
    </div>
  );
}
