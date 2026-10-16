import { t } from "./i18n.ts";
import styles from "./SkipLink.module.css";

/** Focuses where a page lands without scrolling, so the next Tab reaches its first control after it; the tabindex it
    adds goes again on blur. False when the element takes no focus. */
export function landFocus(element: HTMLElement): boolean {
  if (!element.hasAttribute("tabindex")) {
    element.setAttribute("tabindex", "-1");
    element.classList.add(styles.landed);
    element.addEventListener(
      "blur",
      () => {
        element.removeAttribute("tabindex");
        element.classList.remove(styles.landed);
      },
      { once: true }
    );
  }
  element.focus({ preventScroll: true });
  return document.activeElement === element;
}

/** Focuses the page's main content (landFocus). False where the page has no main content. */
export function focusMain(): boolean {
  const main = document.querySelector("main");
  return !!main && landFocus(main);
}

/** Skip to content: the first Tab stop on every page, out of sight until focused. A press moves focus to the page's
    main content and leaves the address alone, so the history is the router's. */
export function SkipLink(props: {
  /** drawn as focus draws it, for the design document */ state?: "focus";
}) {
  return (
    /* biome-ignore lint/a11y/useValidAnchor: without a script the address itself leads to the content */
    <a
      class={styles.link}
      data-state={props.state}
      href="#content"
      onClick={e => {
        if (focusMain()) e.preventDefault();
      }}
    >
      {t("Skip to content")}
    </a>
  );
}

/** Where Skip to content leads without a script (#content): an empty mark just before the page's content, focusable
    and never drawn. The shell puts it between its header and the page. */
export function SkipTarget() {
  return <div id="content" tabindex="-1" class={styles.target} />;
}
