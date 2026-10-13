import { LOCALE_INFO, type Locale, locale, localizePath, MENU_ORDER, t } from "@grabient/i18n";
import { Flag } from "@grabient/ui/Flag.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import styles from "./LanguageMenu.module.css";
import { chooseLanguage } from "./language.ts";

/* The language menu at the end of every footer. Its choices are links with hreflang, so a crawler and a reader without
   scripts follow them and the app leaves them to the browser, which loads the page anew in that language; a press also
   keeps the choice (chooseLanguage). The page's address is read again whenever the menu is reached, since a page can
   change it in place, and the list's flags are drawn only from then on, which keeps them out of the page's HTML. Each
   name carries its own language and direction while the row keeps the page's, so the flag stays at the row's start. */
export function LanguageMenu(props: {
  /** this page's address without its language, read again whenever the menu is reached */
  path: () => string;
  /** false where this page's other languages are for reading only: a crawler is not sent to them */
  follow: boolean;
  /** another language is a page load, which the browser cannot make now */
  disabled?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [at, setAt] = createSignal(props.path());
  const [seen, setSeen] = createSignal(false);
  const reach = () => {
    setAt(props.path());
    setSeen(true);
  };
  const id = createUniqueId();
  let host!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  const close = (focus = false) => {
    setOpen(false);
    if (focus) trigger.focus();
  };
  const choose = (e: MouseEvent, to: Locale) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (to === locale()) {
      e.preventDefault();
      close(true);
      return;
    }
    chooseLanguage(to);
  };
  onSettled(() => {
    const away = (e: PointerEvent) => {
      if (open() && !host.contains(e.target as Node)) close();
    };
    const onEscape = (e: KeyboardEvent) => {
      if (open() && e.key === "Escape") {
        e.preventDefault();
        close(true);
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", onEscape);
    };
  });
  const here = () => LOCALE_INFO[locale()];
  return (
    <div ref={host} class={styles.host}>
      <button
        ref={trigger}
        type="button"
        class={styles.trigger}
        disabled={props.disabled}
        aria-expanded={open() ? "true" : "false"}
        aria-controls={id}
        aria-label={t("Language: {language}", { language: here().name })}
        onPointerEnter={reach}
        onFocus={reach}
        onClick={() => {
          reach();
          setOpen(!open());
        }}
      >
        <Flag region={here().flag} />
        <span lang={here().tag}>{here().name}</span>
        <span class={styles.chevron} data-open={open() ? "" : undefined}>
          <Icon name="chevron" size={12} />
        </span>
      </button>
      <ul
        id={id}
        class={styles.list}
        data-open={open() && !props.disabled ? "" : undefined}
        aria-label={t("Language")}
      >
        <For each={MENU_ORDER} keyed={false}>
          {to => (
            <li>
              <a
                class={styles.row}
                href={localizePath(at(), to())}
                hreflang={LOCALE_INFO[to()].tag}
                rel={props.follow ? undefined : "nofollow"}
                aria-current={to() === locale() ? "true" : undefined}
                onClick={e => choose(e, to())}
              >
                <Show when={seen()}>
                  <Flag region={LOCALE_INFO[to()].flag} />
                </Show>
                <span lang={LOCALE_INFO[to()].tag} dir={LOCALE_INFO[to()].dir}>
                  {LOCALE_INFO[to()].name}
                </span>
              </a>
            </li>
          )}
        </For>
      </ul>
    </div>
  );
}
