import { gradientCss } from "@grabient/engine/css.ts";
import type { Style } from "@grabient/engine/view.ts";
import { type Element, Show, untrack } from "solid-js";
import hidden from "./hidden.module.css";
import { t } from "./i18n.ts";
import styles from "./Thumbnail.module.css";
import { tooltip } from "./Tooltip.tsx";

/** A palette as a small picture in a line of words, where its seed would say nothing: the palette a list was searched
    by stands in the list's title this way. As tall as the line and as wide as a style tile, painted as the cards are.
    Given an address it is the way to the palette: a ring under the pointer, the focus ring for the keyboard, its name
    in a tooltip, and a finger's target taller than the line that adds no height to it. */
export function Thumbnail(props: {
  stops: readonly string[];
  style?: Style;
  angle?: number;
  /** what its colors are called */
  name: string;
  /** the palette's page, in the reader's language */
  href?: string;
  /** a picture in the gradient's place, made once while there is one: the effect a list plays, as its still */
  art?: () => Element;
}) {
  const paint = () => ({
    background: props.art ? undefined : gradientCss(props.stops, props.style, props.angle)
  });
  const label = () => t("{name} palette", { name: props.name });
  const picture = () => (
    <Show when={props.art}>{art => <span class={styles.art}>{untrack(() => art()())}</span>}</Show>
  );
  const tip = tooltip(() => props.name);
  return (
    <Show
      when={props.href}
      fallback={
        <span class={styles.thumb} style={paint()} role="img" aria-label={label()}>
          {picture()}
        </span>
      }
    >
      {href => (
        <a ref={tip} class={styles.thumb} data-link="" href={href()} style={paint()}>
          {picture()}
          <span class={hidden.text}>{label()}</span>
        </a>
      )}
    </Show>
  );
}
