import { createSignal, createUniqueId, type Element, For, onSettled, Show } from "solid-js";
import { Button, type ButtonSize, type ButtonVariant } from "./Button.tsx";
import { Flag, type FlagRegion } from "./Flag.tsx";
import hidden from "./hidden.module.css";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import styles from "./Menu.module.css";

export interface MenuItem {
  value: string;
  label: string;
  /** what the row is set to, at its end */
  detail?: string;
  /** a flag before the label: a language's row, the flag standing for it */
  flag?: FlagRegion;
  /** the label's own language where it is not the page's: a language named in its own words */
  lang?: string;
  /** the row opens more choices in the menu's place: a chevron at its end */
  more?: boolean;
  /** the choices it opens, which a menu button shows in its own place under Back */
  items?: readonly MenuItem[];
  /** the first row of a group of its own: a hairline above it */
  group?: boolean;
  /** a page on another site: the row is a link that opens it in a new tab */
  href?: string;
  /** there, and not to be chosen now: read, and passed by the arrows */
  disabled?: boolean;
}

/** Places an open menu. From the header it hangs --menu-gap under the header's edge; anywhere else it opens below its
    button (above with `up`) and turns over when it does not fit and the other side has more room. It stops --menu-edge
    short of the screen's edge, and of a header stuck to the top, and scrolls in itself past that. */
export function placeMenu(el: HTMLElement, up = false): void {
  const css = getComputedStyle(el);
  const host = el.parentElement as HTMLElement;
  const gap = Number.parseFloat(css.getPropertyValue("--menu-gap")) || 0;
  const edge = Number.parseFloat(css.getPropertyValue("--menu-edge")) || 0;
  /* the page's pixels to the menu's own: 1, except on an artboard of the design document, which draws a page scaled */
  const k = host.offsetHeight ? host.getBoundingClientRect().height / host.offsetHeight || 1 : 1;
  const header = host.closest("header");
  if (header) {
    const top = header.getBoundingClientRect().bottom + gap * k;
    el.style.top = `${(top - (el.offsetParent?.getBoundingClientRect().top ?? 0)) / k}px`;
    el.style.maxHeight = `${Math.max(0, (innerHeight - top) / k - edge)}px`;
    return;
  }
  const box = host.getBoundingClientRect();
  /* a header held at the top of the screen covers what runs under it: a menu opening upward stops at its edge */
  const ceiling = [...document.querySelectorAll("header")].reduce((most, h) => {
    const r = h.getBoundingClientRect();
    return r.top <= 0 && r.bottom > most ? r.bottom : most;
  }, 0);
  const below = (innerHeight - box.bottom) / k - gap - edge;
  const above = (box.top - ceiling) / k - gap - edge;
  const need = el.scrollHeight;
  const upward = up ? !(need > above && below > above) : need > below && above > below;
  el.toggleAttribute("data-up", upward);
  el.style.maxHeight = `${Math.max(0, upward ? above : below)}px`;
}

/** A row's words: the name, a language's flag before it. A row with choices of its own keeps its name whole, and the
    choice it names at the row's end gives way instead. */
export function MenuFace(props: { item: MenuItem }) {
  return (
    <Show
      when={props.item.flag}
      fallback={
        <span
          class={styles.name}
          data-whole={props.item.items ? "" : undefined}
          lang={props.item.lang}
          dir="auto"
        >
          {props.item.label}
        </span>
      }
    >
      {flag => (
        <span class={styles.lead}>
          <Flag region={flag()} />
          <span class={styles.name} lang={props.item.lang} dir="auto">
            {props.item.label}
          </span>
        </span>
      )}
    </Show>
  );
}

/** A list of choices on glass. Focus moves into it as it opens, onto the chosen row or the first, so the arrows start
    there; Home and End take the first and the last. Focus leaving the menu and its button closes it. The choices a row
    opened (`back`) lead back to the rows they came from by a Back row and by the arrow toward the line's start. */
export function MenuList(props: {
  items: readonly MenuItem[];
  value?: string;
  up?: boolean;
  align?: "start" | "end";
  label: string;
  /** a list of many rows: the dense height */
  dense?: boolean;
  back?: { label: string; onBack: () => void };
  onPick: (item: MenuItem) => void;
  onClose: () => void;
}) {
  let list!: HTMLDivElement;
  const rows = () => [
    ...list.querySelectorAll<HTMLElement>('button:not([disabled]), a[role="menuitem"]')
  ];
  /* the row scrolls into the list's view, never the page's */
  onSettled(() => {
    placeMenu(list, !!props.up);
    const row = list.querySelector<HTMLElement>("[data-current]") ?? rows()[0];
    if (!row) return;
    row.focus({ preventScroll: true });
    if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = row.offsetTop - list.clientHeight / 2;
  });
  /* when the focused row leaves with its list (a row's choices swapping in), relatedTarget is null and nothing closes */
  const away = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && !(list.parentElement ?? list).contains(to)) props.onClose();
  };
  const focusAt = (i: number) => {
    const all = rows();
    if (all.length) all[(i + all.length) % all.length].focus();
  };
  const keys = (e: KeyboardEvent) => {
    const all = rows();
    const at = all.indexOf(document.activeElement as HTMLElement);
    /* back is toward the start of the line and into more toward its end, whichever way the page reads */
    const rtl = getComputedStyle(list).direction === "rtl";
    const go = (fn: () => void) => {
      e.preventDefault();
      fn();
    };
    if (e.key === "ArrowDown") go(() => focusAt(at + 1));
    else if (e.key === "ArrowUp") go(() => focusAt(at - 1));
    else if (e.key === "Home") go(() => focusAt(0));
    else if (e.key === "End") go(() => focusAt(-1));
    else if (e.key === (rtl ? "ArrowRight" : "ArrowLeft") && props.back)
      go(() => props.back?.onBack());
    else if (e.key === (rtl ? "ArrowLeft" : "ArrowRight") && all[at]?.hasAttribute("data-more"))
      go(() => all[at].click());
  };
  return (
    <div
      ref={list}
      role="menu"
      aria-label={props.label}
      class={styles.menu}
      data-up={props.up ? "" : undefined}
      data-align={props.align ?? "start"}
      data-dense={props.dense ? "" : undefined}
      onKeyDown={keys}
      onFocusOut={away}
    >
      <Show when={props.back}>
        {back => (
          <>
            <button
              type="button"
              role="menuitem"
              class={styles.row}
              onClick={() => back().onBack()}
            >
              <span class={styles.lead}>
                <Icon name="chevronLeft" size={14} />
                <span>{back().label}</span>
              </span>
            </button>
            <hr class={styles.rule} />
          </>
        )}
      </Show>
      <For each={props.items} keyed={false}>
        {(item, i) => {
          /* a row with choices of its own is current while one of them is */
          const on = () =>
            item().value === props.value || !!item().items?.some(c => c.value === props.value);
          /* a menu with a value makes its rows radio items; without one, and for a row that opens more, menu items */
          const choice = () => props.value !== undefined && !item().more;
          return (
            <>
              <Show when={item().group && i > 0}>
                <hr class={styles.rule} />
              </Show>
              {/* rows are reused in place, so a row can turn from a link into a press: read the item, never a value
                  captured once */}
              <Show
                when={item().href !== undefined && !item().disabled}
                fallback={
                  /* biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is chosen as the row is drawn, and
                       aria-checked goes only with menuitemradio */
                  <button
                    type="button"
                    role={choice() ? "menuitemradio" : "menuitem"}
                    class={styles.row}
                    aria-checked={choice() ? (on() ? "true" : "false") : undefined}
                    aria-haspopup={item().more ? "menu" : undefined}
                    data-current={on() ? "" : undefined}
                    data-more={item().more ? "" : undefined}
                    data-value={item().value}
                    disabled={item().disabled}
                    onClick={() => {
                      props.onPick(item());
                      props.onClose();
                    }}
                  >
                    <MenuFace item={item()} />
                    <Show when={item().detail || item().more}>
                      <span class={styles.trail} data-whole={item().items ? undefined : ""}>
                        <Show when={item().detail}>
                          {/* left to right, so 1920×1080 keeps its order in a right-to-left page */}
                          <span
                            class={styles.detail}
                            data-wraps={item().items ? "" : undefined}
                            dir="ltr"
                          >
                            {item().detail}
                          </span>
                        </Show>
                        <Show when={item().more}>
                          <span class={styles.more}>
                            <Icon name="chevronRight" size={12} />
                          </span>
                        </Show>
                      </span>
                    </Show>
                  </button>
                }
              >
                <a
                  role="menuitem"
                  class={styles.row}
                  href={item().href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-value={item().value}
                  onClick={() => props.onClose()}
                >
                  <MenuFace item={item()} />
                  <span class={styles.trail} data-whole="">
                    <Icon name="external" size={12} />
                  </span>
                  <span class={hidden.text}>{t("(opens in a new tab)")}</span>
                </a>
              </Show>
            </>
          );
        }}
      </For>
    </div>
  );
}

/** A short list on glass, opened by a button; a full-width button reads as a select. It picks one thing and closes.
    A row with choices of its own shows them in the menu's place under Back. Escape steps back out of those first, then
    closes, and the keyboard returns to the button. */
export function MenuButton(props: {
  items: readonly MenuItem[];
  value?: string;
  /** what the button says; by default the chosen item's label */
  children?: Element;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: Element;
  /** the menu opens above: for a button at the bottom of the screen */
  up?: boolean;
  align?: "start" | "end";
  full?: boolean;
  disabled?: boolean;
  dense?: boolean;
  "aria-label"?: string;
  onPick: (item: MenuItem) => void;
}) {
  const [open, setOpen] = createSignal(false);
  /* the row whose choices stand in the menu's place, or null for the menu's own rows */
  const [sub, setSub] = createSignal<MenuItem | null>(null);
  const id = createUniqueId();
  let host!: HTMLDivElement;
  let keep = false;
  const button = () => host.querySelector("button");
  /* a press on a row with choices keeps the menu open on them; any other close restores its rows and, if focus was in
     the menu, returns it to the button */
  const close = () => {
    if (keep) {
      keep = false;
      return;
    }
    const inside = host.contains(document.activeElement) && document.activeElement !== button();
    setOpen(false);
    setSub(null);
    if (inside) button()?.focus({ preventScroll: true });
  };
  /* back to the rows the choices came from, the keyboard on the row that opened them */
  const back = () => {
    const from = sub()?.value ?? "";
    setSub(null);
    setTimeout(() =>
      host.querySelector<HTMLElement>(`[role="menu"] [data-value="${CSS.escape(from)}"]`)?.focus()
    );
  };
  const pick = (item: MenuItem) => {
    if (!item.items) return props.onPick(item);
    keep = true;
    setSub(item);
    /* the rows that were there are gone: the list starts at its top, the keyboard on the current choice or the first */
    setTimeout(() => {
      const list = host.querySelector('[role="menu"]');
      if (list) list.scrollTop = 0;
      host
        .querySelector<HTMLElement>(
          '[role="menu"] [aria-checked="true"], [role="menu"] [data-value]'
        )
        ?.focus();
    });
  };
  onSettled(() => {
    const outside = (e: PointerEvent) => {
      if (open() && !host.contains(e.target as Node)) {
        setOpen(false);
        setSub(null);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open()) return;
      e.stopPropagation();
      if (sub()) back();
      else {
        setOpen(false);
        button()?.focus();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  });
  const current = () =>
    props.items.find(i => i.value === props.value) ??
    props.items.flatMap(i => i.items ?? []).find(i => i.value === props.value);
  /* whether the button shows words of its own (its children, or the chosen item's label), asked without drawing them */
  const worded = () => "children" in props || props.value !== undefined;
  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions: the arrows that open the menu come up from its button */
    <div
      ref={host}
      class={styles.host}
      data-full={props.full ? "" : undefined}
      onKeyDown={e => {
        /* the arrows open it from its button, as a menu button's do */
        if (open() || (e.key !== "ArrowDown" && e.key !== "ArrowUp") || e.target !== button())
          return;
        e.preventDefault();
        setSub(null);
        setOpen(true);
      }}
    >
      {/* the name is the field (Size) then the visible words (1080p), so voice control can say what is on screen; a
          button with no words of its own is named by aria-label */}
      <Button
        variant={props.variant}
        size={props.size}
        full={props.full}
        spread={props.full}
        disabled={props.disabled}
        aria-label={worded() ? undefined : props["aria-label"]}
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => {
          setSub(null);
          setOpen(!open());
        }}
      >
        {props.icon}
        {worded() && props["aria-label"] && (
          <span class={hidden.text}>{`${props["aria-label"]} `}</span>
        )}
        {props.children ?? current()?.label ?? ""}
        <span
          class={styles.chevron}
          data-open={open() ? "" : undefined}
          data-end={props.full ? "" : undefined}
        >
          <Icon name="chevron" size={14} />
        </span>
      </Button>
      <Show when={open()}>
        <MenuList
          items={sub()?.items ?? props.items}
          value={props.value}
          up={props.up}
          align={props.align}
          dense={props.dense}
          label={sub()?.label ?? props["aria-label"] ?? id}
          back={sub() ? { label: t("Back"), onBack: back } : undefined}
          onPick={pick}
          onClose={close}
        />
      </Show>
    </div>
  );
}
