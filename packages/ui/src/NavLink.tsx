import type { Element } from "solid-js";
import hidden from "./hidden.module.css";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import styles from "./NavLink.module.css";

/** A link in a list of pages: the brand pages' navigation, the account menu. Exactly one in a list is `current`. An
    `external` link opens another site in a new tab, the external glyph leading its label. */
export function NavLink(props: {
  href: string;
  current?: boolean;
  small?: boolean;
  center?: boolean;
  /** shown and not followed: a page that needs the connection the browser lacks. With no address, no Tab lands on it */
  disabled?: boolean;
  external?: boolean;
  /** what follows an external link's label: the stars beside the link to the code */
  after?: Element;
  onClick?: (e: MouseEvent) => void;
  children: Element;
}) {
  const flag = (on: boolean | undefined) => (on ? "" : undefined);
  /* a branch of its own, so every other link is its label alone */
  return props.external ? (
    <a
      class={styles.link}
      data-small={flag(props.small)}
      data-center={flag(props.center)}
      href={props.disabled ? undefined : props.href}
      aria-disabled={props.disabled ? "true" : undefined}
      target="_blank"
      rel="noopener noreferrer"
      onClick={e => props.onClick?.(e)}
    >
      <Icon name="external" size={13} />
      <span class={styles.caps}>{props.children}</span>
      {props.after}
      <span class={hidden.text}>{t("(opens in a new tab)")}</span>
    </a>
  ) : (
    <a
      class={styles.link}
      data-small={flag(props.small)}
      data-center={flag(props.center)}
      href={props.disabled ? undefined : props.href}
      aria-disabled={props.disabled ? "true" : undefined}
      aria-current={props.current ? "page" : undefined}
      onClick={e => props.onClick?.(e)}
    >
      {props.children}
    </a>
  );
}
