import { For, onSettled, Show } from "solid-js";
import { msg, t } from "./i18n.ts";
import styles from "./KeyList.module.css";
import { type KeyRow, matches } from "./keys.ts";
import link from "./link.module.css";

/* each scope's heading, as a message; a scope not named here is its own heading */
const HEADINGS: Record<string, string> = {
  "Every route": msg("Everywhere"),
  Editor: msg("Editor")
};
const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "AltGraph", "Fn"]);

/** The keys that work here, on glass at the bottom center, opened by ?. One group per place a key works, each row the
    keys as chips and a few words of what they do; a pair that does one thing both ways shares a row. It takes the
    keyboard and gives it back where it was, over a panel left open beneath it (data-over). ? or Escape closes it and
    goes no further; any other key or a press anywhere closes it and still does what it does. */
export function KeyList(props: {
  rows: readonly KeyRow[];
  onClose: () => void;
  /** where the keys can be changed, when there is such a page */
  bindingsHref?: string;
}) {
  let sheet!: HTMLDivElement;
  onSettled(() => {
    const from = document.activeElement as HTMLElement | null;
    sheet.focus({ preventScroll: true });
    const close = () => {
      props.onClose();
      if (from?.isConnected && from !== document.body) from.focus({ preventScroll: true });
    };
    const onKey = (e: KeyboardEvent) => {
      /* a held Shift is part of a ? still to come */
      if (MODIFIERS.has(e.key)) return;
      if (e.key === "Escape" || matches(e, "?")) {
        e.preventDefault();
        e.stopPropagation();
        return close();
      }
      /* Tab stays in the list, between it and its one link, and Enter follows the link */
      const change = sheet.querySelector("a");
      if (e.key === "Tab") {
        e.preventDefault();
        (change && document.activeElement !== change ? change : sheet).focus({
          preventScroll: true
        });
        return;
      }
      if (e.key === "Enter" && change && document.activeElement === change) return;
      close();
    };
    /* a press inside the list is the list's own; any press elsewhere closes it */
    const onDown = (e: PointerEvent) => {
      if (!sheet.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown, true);
    };
  });
  /* groups in the order the rows arrive; a row with no scope joins the first group */
  const groups = () => {
    const out: { scope: string; rows: KeyRow[] }[] = [];
    for (const row of props.rows) {
      const scope = row.scope ?? out[0]?.scope ?? "";
      const group = out.find(g => g.scope === scope);
      if (group) group.rows.push(row);
      else out.push({ scope, rows: [row] });
    }
    return out;
  };
  return (
    <div
      ref={sheet}
      class={styles.sheet}
      role="dialog"
      aria-label={t("Shortcuts")}
      tabindex="-1"
      data-over=""
    >
      <div class={styles.groups}>
        <For each={groups()} keyed={false}>
          {group => (
            <section class={styles.group}>
              <Show when={groups().length > 1}>
                <h2 class={styles.head}>{t(HEADINGS[group().scope] ?? group().scope)}</h2>
              </Show>
              <dl class={styles.rows}>
                <For each={group().rows} keyed={false}>
                  {row => (
                    <>
                      <dt class={styles.keys}>
                        {/* each chip reads left to right, as the key does */}
                        <For each={row().keys}>
                          {key => (
                            <kbd class={styles.key} dir="ltr">
                              {key}
                            </kbd>
                          )}
                        </For>
                      </dt>
                      <dd class={styles.label}>{t(row().label)}</dd>
                    </>
                  )}
                </For>
              </dl>
            </section>
          )}
        </For>
      </div>
      <Show when={props.bindingsHref}>
        {href => (
          <p class={styles.foot}>
            <a class={link.inline} href={href()}>
              {t("Change shortcuts")}
            </a>
          </p>
        )}
      </Show>
    </div>
  );
}
