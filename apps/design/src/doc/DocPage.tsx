import { BarLight } from "@grabient/ui/contexts.ts";
import { Label } from "@grabient/ui/Label.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { createSignal, type Element, For, onSettled, useContext } from "solid-js";
import type { Page } from "../contents.ts";
import styles from "./DocPage.module.css";
import { Footer } from "./Footer.tsx";

/** A page of the document: its sections listed down the side under their groups, the one in view marked in the
    wordmark bar's colors, and the page itself beside them. The list stays in view as the page scrolls. */
export function DocPage(props: { page: Page; children: Element }) {
  const light = useContext(BarLight);
  const [current, setCurrent] = createSignal("");
  let main!: HTMLElement;
  /* the section in view is the last whose top has passed a third of the way down the window, or the last section once
     the page can scroll no further */
  onSettled(() => {
    const sections = [...main.querySelectorAll<HTMLElement>("section[id]")];
    let frame = 0;
    const spy = () => {
      frame = 0;
      const end = innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      let id = sections[0]?.id ?? "";
      for (const section of sections)
        if (section.getBoundingClientRect().top <= innerHeight / 3) id = section.id;
      setCurrent(end ? (sections.at(-1)?.id ?? id) : id);
    };
    const later = () => {
      frame ||= requestAnimationFrame(spy);
    };
    spy();
    addEventListener("scroll", later, { passive: true });
    addEventListener("resize", later);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", later);
      removeEventListener("resize", later);
    };
  });
  return (
    <div class={styles.frame}>
      <aside class={styles.side} style={{ "--bar": `linear-gradient(${light().join(", ")})` }}>
        <nav class={styles.nav} aria-label={`${props.page.title} sections`}>
          <For each={props.page.groups}>
            {group => (
              <div class={styles.group}>
                <Label>{group.name}</Label>
                <ul class={styles.list}>
                  <For each={group.entries}>
                    {entry => (
                      <li>
                        <a
                          class={styles.link}
                          href={`#${entry.id}`}
                          aria-current={current() === entry.id ? "location" : undefined}
                        >
                          {entry.title}
                        </a>
                      </li>
                    )}
                  </For>
                </ul>
              </div>
            )}
          </For>
        </nav>
      </aside>
      <main id="content" ref={main} class={styles.main}>
        <header class={styles.intro}>
          <Text variant="title" as="h1">
            {props.page.title}
          </Text>
          <Text variant="lede">{props.page.lede}</Text>
        </header>
        {props.children}
        <Footer />
      </main>
    </div>
  );
}
