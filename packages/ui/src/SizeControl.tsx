import { createSignal, createUniqueId, For, onSettled, Show } from "solid-js";
import { Button } from "./Button.tsx";
import { focusLeft, pressOutside, typingIn } from "./dismiss.ts";
import { Icon } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import { composing } from "./keys.ts";
import { MenuFace, type MenuItem } from "./Menu.tsx";
import rows from "./rows.module.css";
import { Scrub } from "./Scrub.tsx";
import styles from "./SizeControl.module.css";
import {
  isFixedSize,
  loadPressedSize,
  normalizeSize,
  parseSide,
  pressedSize,
  pressSize,
  resolveSize,
  SIZE_MAX,
  SIZE_MIN,
  type Size,
  type SizeChoice,
  type SizeRow,
  screenSize,
  sizeLabel,
  sizeRows
} from "./sizes.ts";

export type { Size, SizeChoice };

/* The preview's size: a glass button that opens a sheet with Width and Height over the size presets. A maker's row
   opens its devices in the list's place under Back. Resting on a row previews that size; a press commits it, and the
   chosen row pressed again returns to Auto. Width and Height read Auto a step under their floor, and an Auto side
   follows the other at the stage's shape. The presets are one stop for Tab, on the chosen row, and the keyboard
   leaving the sheet puts it away. */
export function SizeControl(props: {
  /** the size the reader set, or null for Auto; a side may be auto */
  value: SizeChoice | null;
  /** what Auto is now: the stage's own pixels */
  auto: Size;
  onChange: (size: SizeChoice | null) => void;
  /** resting on a row: its size, or null for Auto; undefined once the pointer leaves */
  onPeek?: (size: Size | null | undefined) => void;
  /** large on the stage; small over a card-sized picture */
  size?: "sm" | "lg";
}) {
  const id = createUniqueId();
  const [open, setOpen] = createSignal(false);
  /* the reader's screen, read as the sheet opens: a window moved to another screen reads that one */
  const [screen, setScreen] = createSignal<Size | null>(null);
  /* the maker whose devices stand in the list's place, or null for the sizes themselves */
  const [maker, setMaker] = createSignal<MenuItem | null>(null);
  let host!: HTMLDivElement;
  let list: HTMLDivElement | undefined;
  /* the pixels the size comes to, the stage's own at Auto */
  const shown = () => resolveSize(props.value, props.auto);
  const dims = () => (props.value ? `${shown().width} × ${shown().height}` : null);
  const trigger = () => host.querySelector<HTMLButtonElement>("button");
  const off = () => props.onPeek?.(undefined);
  const close = (focus = false) => {
    off();
    setOpen(false);
    setMaker(null);
    if (focus) trigger()?.focus({ preventScroll: true });
  };
  /* the list holds the focus while its rows change under it (a maker opening or closing), so a key pressed then still
     lands; then the focus goes to the row asked for, quietly: a focus the list moves previews nothing */
  let quiet = false;
  let landing: ReturnType<typeof setTimeout> | undefined;
  const land = (selector: string) => {
    list?.focus({ preventScroll: true });
    clearTimeout(landing);
    landing = setTimeout(() => {
      if (!list) return;
      list.scrollTop = 0;
      quiet = true;
      (list.querySelector<HTMLButtonElement>(selector) ?? list.querySelector("button"))?.focus({
        preventScroll: true
      });
      quiet = false;
    }, 0);
  };
  /* opened from the keyboard, the keyboard goes to the size chosen, as a menu's does */
  const show = (keyboard: boolean) => {
    setScreen(screenSize());
    setMaker(null);
    setOpen(true);
    if (keyboard) land('[aria-selected="true"]');
  };
  onSettled(() => {
    loadPressedSize();
    const away = pressOutside(
      () => [host],
      () => {
        if (open()) close();
      }
    );
    /* Escape steps back out of a maker's devices first, then closes; while Width or Height is typed in it is the
       field's, which puts the number back, and an input method's Escape is its own */
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open() || composing(e) || typingIn(host, e.target)) return;
      e.stopPropagation();
      if (maker()) back();
      else close(true);
    };
    document.addEventListener("keydown", onEscape, true);
    return () => {
      away();
      document.removeEventListener("keydown", onEscape, true);
      clearTimeout(landing);
    };
  });
  const sizes = () => sizeRows(props.auto, screen());
  const current = (): readonly SizeRow[] => maker()?.items ?? sizes();
  const fits = (r: SizeRow) =>
    r.value === "auto"
      ? !props.value
      : isFixedSize(props.value) && r.w === props.value.width && r.h === props.value.height;
  /* the size is the row pressed last where its pixels are the size, else the first whose pixels are */
  const picked = () => {
    const all: SizeRow[] = sizes().flatMap(r => r.items ?? [r]);
    return all.find(r => r.value === pressedSize() && fits(r)) ?? all.find(fits);
  };
  /* the row lit: the size itself, or the maker whose device it is */
  const holds = (r: SizeRow) => {
    const p = picked();
    return !!p && (r.value === p.value || !!r.items?.some(d => d.value === p.value));
  };
  const lit = () => current().find(holds)?.value;
  const sizeOf = (r: SizeRow): Size | null => (r.w && r.h ? { width: r.w, height: r.h } : null);
  const back = () => {
    const from = maker()?.value ?? "";
    land(`[data-value="${CSS.escape(from)}"]`);
    setMaker(null);
  };
  const pick = (r: SizeRow) => {
    if (r.items) {
      off();
      land('[aria-selected="true"]');
      setMaker(r);
      return;
    }
    const was = lit();
    pressSize(r.value);
    props.onChange(r.value === was ? null : sizeOf(r));
    close(true);
  };
  /* the arrows walk the rows, Home and End go to the ends; toward the line's end opens a maker, toward its start goes
     back, whichever way the page reads */
  const walk = (e: KeyboardEvent) => {
    if (!list) return;
    const rtl = getComputedStyle(list).direction === "rtl";
    const presses = [...list.querySelectorAll("button")];
    const i = presses.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === (rtl ? "ArrowRight" : "ArrowLeft") && maker()) {
      e.preventDefault();
      return back();
    }
    if (e.key === (rtl ? "ArrowLeft" : "ArrowRight") && presses[i]?.hasAttribute("data-more")) {
      e.preventDefault();
      return presses[i].click();
    }
    const to =
      e.key === "ArrowDown"
        ? i + 1
        : e.key === "ArrowUp"
          ? i < 0
            ? -1
            : i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? -1
              : null;
    if (to === null || !presses.length) return;
    e.preventDefault();
    presses[(to + presses.length) % presses.length].focus();
  };
  /* Width and Height read Auto at Auto and where a side was lowered past its floor */
  const isAuto = (k: "width" | "height") => !props.value || props.value[k] === "auto";
  const write = (k: "width" | "height", v: number) => {
    const o = k === "width" ? "height" : "width";
    const c = props.value;
    const mine: number | "auto" = v < SIZE_MIN ? "auto" : Math.round(v);
    /* from Auto a number keeps the other side at the stage's pixels, so the shape follows the number */
    const theirs: number | "auto" = c ? c[o] : mine === "auto" ? "auto" : shown()[o];
    props.onChange(
      normalizeSize(
        k === "width" ? { width: mine, height: theirs } : { width: theirs, height: mine }
      )
    );
  };
  const field = (k: "width" | "height", label: string) => (
    <Scrub
      small
      label={label}
      min={SIZE_MIN - 1}
      max={SIZE_MAX}
      step={1}
      grain={1}
      def={SIZE_MIN - 1}
      value={isAuto(k) ? SIZE_MIN - 1 : shown()[k]}
      origin={isAuto(k) ? shown()[k] : undefined}
      fmt={v => (v < SIZE_MIN ? t("Auto") : String(Math.round(v)))}
      parse={parseSide}
      onInput={v => write(k, v)}
    />
  );
  return (
    <div ref={host} class={styles.host}>
      <Button
        variant="art"
        icon
        size={props.size ?? "lg"}
        aria-label={t(dims() ? msg("Preview size: {size}") : msg("Preview size: Auto"), {
          size: dims() ?? ""
        })}
        tip={t(dims() ? msg("Size · {size}") : msg("Size · Auto"), { size: dims() ?? "" })}
        aria-expanded={open()}
        onClick={e => (open() ? close(true) : show(e.detail === 0))}
      >
        <Icon name="monitor" size={15} />
      </Button>
      <Show when={open()}>
        <div
          id={id}
          class={styles.sheet}
          role="dialog"
          aria-label={t("Preview size")}
          data-keys="own"
          onPointerLeave={off}
          onFocusOut={e => {
            if (focusLeft(e, host)) close();
          }}
        >
          <div class={styles.pair}>
            {field("width", t("Width"))}
            {field("height", t("Height"))}
          </div>
          <div class={styles.rows}>
            {/* a maker's devices stand under Back, which stays in view while they scroll */}
            <Show when={maker()}>
              <div data-dense="">
                <button type="button" class={rows.row} onClick={back}>
                  <span class={styles.back}>
                    <Icon name="chevronLeft" size={14} />
                    <span>{t("Back")}</span>
                  </span>
                </button>
              </div>
              <div class={rows.rule} aria-hidden="true" />
            </Show>
            <div
              ref={list}
              class={styles.list}
              data-dense=""
              role="listbox"
              tabindex={-1}
              aria-label={maker()?.label ?? t("Size presets")}
              onKeyDown={walk}
            >
              <For each={current()} keyed={false}>
                {(r, i) => {
                  /* a maker's row previews nothing: resting on it lets go of what a device was showing */
                  const rest = (e?: PointerEvent) => {
                    if (quiet) return;
                    if (r().items) off();
                    else if (e?.pointerType !== "touch") props.onPeek?.(sizeOf(r()));
                  };
                  return (
                    <>
                      <Show when={r().group && i > 0}>
                        <div role="none" class={rows.rule} aria-hidden="true" />
                      </Show>
                      <button
                        type="button"
                        role="option"
                        tabindex={(lit() ?? current()[0]?.value) === r().value ? 0 : -1}
                        class={[rows.row, rows.spread]}
                        aria-selected={lit() === r().value ? "true" : "false"}
                        data-current={lit() === r().value ? "" : undefined}
                        data-value={r().value}
                        data-more={r().items ? "" : undefined}
                        onPointerEnter={e => rest(e)}
                        onFocus={() => rest()}
                        onBlur={off}
                        onClick={() => pick(r())}
                      >
                        <MenuFace item={{ ...r(), label: sizeLabel(r()) }} />
                        {/* a maker's row names the chosen size when it is one of the maker's devices */}
                        <span class={styles.trail} data-fixed={r().items ? undefined : ""}>
                          <Show
                            when={r().items}
                            fallback={
                              <span class={rows.detail} dir="ltr">
                                {r().detail}
                              </span>
                            }
                          >
                            <Show when={holds(r()) ? picked() : undefined}>
                              {p => (
                                <span class={[rows.detail, styles.device]}>{sizeLabel(p())}</span>
                              )}
                            </Show>
                            <Icon name="chevronRight" size={12} />
                          </Show>
                        </span>
                      </button>
                    </>
                  );
                }}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
