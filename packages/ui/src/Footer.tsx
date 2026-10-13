import { children, type Element, For, Show } from "solid-js";
import styles from "./Footer.module.css";
import hidden from "./hidden.module.css";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import type { FrameLink } from "./PageFrame.tsx";
import { Stars } from "./Stars.tsx";

/** The links at the foot of every page: the legal pages, then the pages and sites that are not the site's own lists,
    then the language menu. In a full-height column it falls to the bottom of the screen when the content is short and
    follows the content when it is long. A link to another site opens in a new tab, the external glyph leading it. A
    note (the sign-in sheet's terms) is a line of its own beneath, so a line that wraps on a phone pushes nothing into
    the language menu. */
export function Footer(props: {
  links: readonly FrameLink[];
  /** the language menu, last in the row */
  languages?: Element;
  note?: Element;
}) {
  /* resolved once: each read of an element prop would build it again */
  const note = children(() => props.note);
  const noted = () => note.toArray().length > 0;
  return (
    <footer class={styles.footer} data-noted={noted() ? "" : undefined}>
      <For each={props.links} keyed={false}>
        {link => (
          <Show
            when={link().external}
            fallback={
              <a
                class={styles.link}
                href={link().disabled ? undefined : link().href}
                aria-current={link().current ? "page" : undefined}
                aria-disabled={link().disabled ? "true" : undefined}
              >
                {link().label}
              </a>
            }
          >
            <a
              class={styles.external}
              href={link().disabled ? undefined : link().href}
              aria-disabled={link().disabled ? "true" : undefined}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="external" size={13} />
              {link().label}
              <Show when={link().stars != null}>
                <Stars count={link().stars ?? 0} />
              </Show>
              <span class={hidden.text}>{t("(opens in a new tab)")}</span>
            </a>
          </Show>
        )}
      </For>
      {props.languages}
      <Show when={noted()}>
        <div class={styles.note}>{note()}</div>
      </Show>
    </footer>
  );
}
