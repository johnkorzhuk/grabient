import { Label } from "@grabient/ui/Label.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { type Element, For, Show } from "solid-js";
import { sectionOf } from "../contents.ts";
import styles from "./Section.module.css";

/** A section of a page, named by the outline: its group as an eyebrow, its title and one line of summary, then what it
    shows. Its id is the address the side list links to. */
export function Section(props: { id: string; summary: string; children: Element }) {
  return (
    <section id={props.id} class={styles.section} aria-labelledby={`${props.id}-title`}>
      <header class={styles.head}>
        <Label>{sectionOf(props.id).group}</Label>
        <Text variant="title" as="h2" id={`${props.id}-title`}>
          {sectionOf(props.id).title}
        </Text>
        <Text variant="lede">{props.summary}</Text>
      </header>
      {props.children}
    </section>
  );
}

/** One part of a section under its own heading: the specimens of a kind, the tokens, the rules. */
export function Block(props: { title?: string; children: Element }) {
  return (
    <div class={styles.block}>
      <Show when={props.title}>
        {title => (
          <Text variant="h3" as="h3">
            {title()}
          </Text>
        )}
      </Show>
      {props.children}
    </div>
  );
}

/** A few one-line rules. */
export function Rules(props: { rules: readonly string[] }) {
  return (
    <ul class={styles.rules}>
      <For each={props.rules}>
        {rule => (
          <li class={styles.rule}>
            <Text variant="ui">{rule}</Text>
          </li>
        )}
      </For>
    </ul>
  );
}
