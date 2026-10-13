import { type Element, Show } from "solid-js";
import styles from "./Header.module.css";
import { Icon } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import { Logo } from "./Logo.tsx";
import { Rule } from "./Rule.tsx";
import { Text } from "./Text.tsx";
import { tooltip } from "./Tooltip.tsx";

/** One sticky header on every page, over the water, in two forms. The brand form (sign-in, settings, about) has no
    surface and no rule, and leaves the wordmark's bar open so the water shows through it; once the page scrolls under
    it, the surface comes up and the bar fills, at the same height, so nothing on the page moves. The app form (lists,
    editor) has a nearly opaque surface, the bar filled with the palette in view, and the dashed rule beneath. The
    surface is a layer behind the bar: a blur on the header itself would keep its menus' own blur inside it. */
export function Header(props: {
  stops: readonly string[];
  /** the brand form */
  brand?: boolean;
  /** the page has scrolled under the header: a brand header takes the app form's surface and fills its bar */
  scrolled?: boolean;
  /** the water has drawn, so a brand header's bar may open onto it; until then it is filled */
  lit?: boolean;
  /** the wordmark keeps its motion under reduced motion: the sign-in page, whose water moves too */
  moves?: boolean;
  /** the dashed rule under the bar: the app routes */
  rule?: boolean;
  barRef?: (el: SVGRectElement) => void;
  /** where the wordmark leads and what it says it leads to; the site's lists by default */
  home?: { href: string; label: string };
  /** a word on the page's connection after the wordmark (Offline): a glyph and the word, the word clipped on a phone */
  status?: string;
  /** the corner: theme, account */
  children?: Element;
}) {
  const home = () =>
    props.home
      ? t(msg("Grabient, {label}"), { label: props.home.label })
      : t("Grabient, all palettes");
  return (
    <header class={styles.header}>
      <span
        class={styles.surface}
        data-on={!props.brand || props.scrolled ? "" : undefined}
        aria-hidden="true"
      />
      <div class={styles.bar} data-brand={props.brand ? "" : undefined}>
        {/* data-home: the way home, which the app opens with the reader's view */}
        <a class={styles.home} href={props.home?.href ?? "/"} data-home="" aria-label={home()}>
          <span class={styles.logo} data-motion-keep={props.moves ? "" : undefined}>
            <Logo
              stops={props.stops}
              mode={props.brand && props.lit && !props.scrolled ? "window" : "fill"}
              barRef={props.barRef}
            />
          </span>
        </a>
        {/* read aloud as it changes, so it stands empty while there is nothing to say */}
        <span class={styles.status} role="status">
          <Show when={props.status}>
            {words => (
              <span class={styles.mark} ref={tooltip(() => words())}>
                <span class={styles.glyph} aria-hidden="true">
                  <Icon name="cloudOff" size={14} />
                </span>
                <span class={styles.words}>
                  <Text variant="micro">{words()}</Text>
                </span>
              </span>
            )}
          </Show>
        </span>
        <div class={styles.corner}>{props.children}</div>
      </div>
      <div class={styles.rule} data-off={props.brand || !props.rule ? "" : undefined}>
        <Rule inset />
      </div>
    </header>
  );
}
