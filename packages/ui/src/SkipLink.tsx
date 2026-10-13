import { t } from "./i18n.ts";
import styles from "./SkipLink.module.css";

/** Focuses the page's main content without scrolling, so the next Tab reaches its first control; the tabindex it adds
    goes again on blur. False where the page has no main content. */
export function focusMain(): boolean {
  const main = document.querySelector("main");
  if (!main) return false;
  if (!main.hasAttribute("tabindex")) {
    main.setAttribute("tabindex", "-1");
    main.classList.add(styles.landed);
    main.addEventListener(
      "blur",
      () => {
        main.removeAttribute("tabindex");
        main.classList.remove(styles.landed);
      },
      { once: true }
    );
  }
  main.focus({ preventScroll: true });
  return document.activeElement === main;
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
