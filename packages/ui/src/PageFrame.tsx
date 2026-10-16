import { children, type Element, For, Show } from "solid-js";
import { Button } from "./Button.tsx";
import { Footer } from "./Footer.tsx";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { NavLink } from "./NavLink.tsx";
import styles from "./PageFrame.module.css";
import { Pane } from "./Pane.tsx";
import { Stars } from "./Stars.tsx";

/** A link of a frame's navigation or footer. */
export interface FrameLink {
  href: string;
  label: string;
  current?: boolean;
  /** a page for the keyboard alone, left out where a finger is the only pointer */
  keyboard?: boolean;
  /** another site, in a new tab */
  external?: boolean;
  /** one of the site's own pages the index keeps out: nofollow */
  rel?: string;
  /** the stars the linked code has on GitHub, after the label once the count is known */
  stars?: number | null;
  /** shown and not followed: a page that needs the connection the browser lacks */
  disabled?: boolean;
}

/** The frame the brand pages share: a side navigation, one frosted pane, and the footer, which rests at the bottom of
    the screen when the content is short. Under 800px of page the navigation becomes a row above the pane. Sign-in
    (`login`) has no navigation: its sheet is centered with the footer pinned below, and on a phone the sheet sits at
    the bottom within reach of a thumb, the footer after it. An `open` page has no pane: it is a column of its own
    sheets, with its words on the page between them. */
export function PageFrame(props: {
  nav?: readonly FrameLink[];
  /** the way home, over the navigation */
  all?: FrameLink;
  footer: readonly FrameLink[];
  /** the language menu, at the end of the footer */
  languages?: Element;
  /** a line beneath the footer: the sign-in sheet's terms */
  note?: Element;
  login?: boolean;
  open?: boolean;
  children: Element;
}) {
  /* resolved once: each read of an element prop would build it again */
  const note = children(() => props.note);
  const languages = children(() => props.languages);
  const has = (part: typeof note) => part.toArray().length > 0;
  return (
    <div
      class={styles.page}
      data-login={props.login ? "" : undefined}
      data-noted={has(note) ? "" : undefined}
    >
      <div class={styles.frame}>
        <Show when={!props.login}>
          <nav class={styles.nav} aria-label={t("About and account")}>
            <Show when={props.all}>
              {all => (
                <div class={styles.all}>
                  <Button size="sm" href={all().href}>
                    <Icon name="back" size={13} />
                    {all().label}
                  </Button>
                </div>
              )}
            </Show>
            <div class={styles.links}>
              <For each={props.nav ?? []} keyed={false}>
                {link => (
                  <span class={styles.item} data-keyboard={link().keyboard ? "" : undefined}>
                    <NavLink
                      href={link().href}
                      rel={link().rel}
                      current={link().current}
                      external={link().external}
                      disabled={link().disabled}
                      after={
                        <Show when={link().stars != null}>
                          <Stars count={link().stars ?? 0} />
                        </Show>
                      }
                    >
                      {link().label}
                    </NavLink>
                  </span>
                )}
              </For>
            </div>
          </nav>
        </Show>
        <div class={styles.body}>
          {/* the sign-in sheet is the page's main landmark too, as the pane is on the other brand pages */}
          <Show
            when={!props.login && !props.open}
            fallback={<main class={styles.content}>{props.children}</main>}
          >
            <Pane as="main" variant="frost" padding="lg">
              <div class={styles.content}>{props.children}</div>
            </Pane>
          </Show>
        </div>
      </div>
      <Show when={props.footer.length > 0 || has(languages) || has(note)}>
        <div class={styles.foot}>
          <Footer links={props.footer} languages={languages()} note={note()} />
        </div>
      </Show>
    </div>
  );
}
