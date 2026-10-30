import { type Element, untrack } from "solid-js";
import { BarRim } from "./BarRim.tsx";
import styles from "./Button.module.css";
import hidden from "./hidden.module.css";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { tooltip } from "./Tooltip.tsx";

/* Five variants, three heights. Primary is ink, once per view; secondary is the quiet default; ghost has no surface
   until the pointer is over it, for rows of icons; art is dark glass over a picture; input stands among fields and
   wears their rim. Hover lifts the surface one step and fills the ink, keyboard focus draws a thin ring, the border
   never changes and nothing moves. A new look is a new variant here, never a class from outside. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "art" | "input";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** stretched to its row: the sign-in actions */
  full?: boolean;
  /** its content at the start and its last child pushed to the end: a full-width menu button reads as a select */
  spread?: boolean;
  /** the label may take two lines where the row is narrow, never more height */
  wrap?: boolean;
  /** a square press holding one icon, named by its aria-label */
  icon?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
  /** disabled and still in the Tab order (aria-disabled): a press that disables itself, such as Undo with nothing
      left, never drops the keyboard */
  keep?: boolean;
  /** destructive: the label in danger ink, never a red fill */
  danger?: boolean;
  /** a link that looks like the press */
  href?: string;
  /** a link's file saved under this name rather than opened: one of the site's own */
  download?: string;
  /** another site, in a new tab, ending in the external glyph */
  external?: boolean;
  /** a link's relation to its page, for one of the site's own: nofollow where the index keeps it out */
  rel?: string;
  "aria-label"?: string;
  /** the words that say what a press does now */
  "aria-describedby"?: string;
  "aria-expanded"?: boolean;
  /** what a press opens: a menu button's list */
  "aria-haspopup"?: "menu" | "listbox" | "dialog";
  "aria-pressed"?: boolean;
  /** one line on rest: an icon's name, a key or a consequence, never the label again */
  tip?: string;
  /** a press turns it in place, as a toggle's does: an open tip stays and says its new name */
  turns?: boolean;
  /** a state held at rest, for the design document */
  state?: "hover" | "focus" | "pressed";
  onClick?: (e: MouseEvent) => void;
  children: Element;
}

const pseudo = (v: boolean | undefined) => (v === undefined ? undefined : v ? "true" : "false");

export function Button(props: ButtonProps) {
  /* what a press is, a link or a button, among fields or not, is settled once, as it is drawn */
  const [link, input] = untrack(() => [props.href !== undefined, props.variant === "input"]);
  const tip = "tip" in props ? tooltip(() => props.tip, { turns: props.turns }) : undefined;
  const flag = (on: boolean | undefined) => (on ? "" : undefined);
  const control = () =>
    link ? (
      /* a disabled link has nowhere to go: no address, so neither a press nor the keyboard follows it */
      <a
        ref={el => tip?.(el)}
        class={styles.button}
        data-variant={props.variant ?? "secondary"}
        data-size={props.size ?? "md"}
        data-icon={flag(props.icon)}
        data-full={flag(props.full)}
        data-spread={flag(props.spread)}
        data-wrap={flag(props.wrap)}
        data-danger={flag(props.danger)}
        data-state={props.state}
        href={props.disabled ? undefined : props.href}
        download={props.download}
        target={props.external ? "_blank" : undefined}
        rel={props.external ? "noopener noreferrer" : props.rel}
        aria-label={props["aria-label"]}
        aria-describedby={props["aria-describedby"]}
        aria-disabled={props.disabled ? "true" : undefined}
        onClick={e => props.onClick?.(e)}
      >
        {props.children}
        {props.external && (
          <>
            <Icon name="external" size={13} />
            <span class={hidden.text}>{t("(opens in a new tab)")}</span>
          </>
        )}
      </a>
    ) : (
      <button
        ref={el => tip?.(el)}
        class={styles.button}
        data-variant={props.variant ?? "secondary"}
        data-size={props.size ?? "md"}
        data-icon={flag(props.icon)}
        data-full={flag(props.full)}
        data-spread={flag(props.spread)}
        data-wrap={flag(props.wrap)}
        data-danger={flag(props.danger)}
        data-state={props.state}
        type={props.type ?? "button"}
        disabled={props.disabled && !props.keep}
        aria-label={props["aria-label"]}
        aria-describedby={props["aria-describedby"]}
        aria-disabled={props.disabled && props.keep ? "true" : undefined}
        aria-expanded={pseudo(props["aria-expanded"])}
        aria-haspopup={props["aria-haspopup"]}
        aria-pressed={pseudo(props["aria-pressed"])}
        onClick={e => {
          if (!props.disabled) props.onClick?.(e);
        }}
      >
        {props.children}
      </button>
    );
  /* the input recipe wears a field's rim, so a host owns the hover and the focus that light it */
  return input ? (
    <span class={styles.rimHost} data-full={flag(props.full)} data-state={props.state}>
      <BarRim />
      {control()}
    </span>
  ) : (
    control()
  );
}
