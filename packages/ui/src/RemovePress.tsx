import { createSignal, onSettled, Show, untrack } from "solid-js";
import { Button } from "./Button.tsx";
import { Icon } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import styles from "./RemovePress.module.css";

/* A collection owner's Remove from collection over a card's picture, beside Edit, and the Undo a removed card shows. The
   press confirms on itself: the first press arms it for ARM_MS, the second takes the palette out. One card is armed at a
   time, by its item, so the arming follows its palette when the order moves it; time, Escape or the focus leaving
   disarm it. A press keeps the focus while its write is on its way, and once the palette is out (or back) the card's
   other press takes it as it stands, however the page drew the card again. */

const ARM_MS = 4000;
const [armedItem, setArmedItem] = createSignal<string | null>(null);
let armTimer: ReturnType<typeof setTimeout> | undefined;

/* the press that had the focus when its palette went out, or came back: the item's press that takes it next */
let handoff: { item: string; to: "remove" | "undo" } | null = null;
function takeFocus(item: string, to: "remove" | "undo", host: HTMLElement | undefined) {
  if (handoff?.item !== item || handoff.to !== to) return;
  handoff = null;
  host?.querySelector("button")?.focus({ preventScroll: true });
}

/** The removal's name says what the next press does. */
const removeName = (armed: boolean, pending: boolean): string =>
  t(
    pending
      ? msg("Removing…")
      : armed
        ? msg("Press again to remove")
        : msg("Remove from collection")
  );

export function RemovePress(props: {
  /** the palette in its view, as the collection holds it */
  item: string;
  /** takes it out; rejects when it could not, which the page says */
  onRemove: () => Promise<void>;
  disabled?: boolean;
}) {
  const [pending, setPending] = createSignal(false);
  let host: HTMLSpanElement | undefined;
  onSettled(() => takeFocus(props.item, "remove", host));
  const armed = () => armedItem() === props.item;
  /* the focus leaves as the press itself leaves the page, while the page is being drawn: a read, never tracked */
  const disarm = () => {
    if (!untrack(armed)) return;
    clearTimeout(armTimer);
    setArmedItem(null);
  };
  const press = async (e: MouseEvent) => {
    if (pending() || props.disabled) return;
    if (!armed()) {
      const item = props.item;
      clearTimeout(armTimer);
      setArmedItem(item);
      armTimer = setTimeout(() => {
        if (armedItem() === item) setArmedItem(null);
      }, ARM_MS);
      return;
    }
    /* the focus stays on this press after a failure, and goes to the card's Undo once the palette is out */
    if (document.activeElement === e.currentTarget) handoff = { item: props.item, to: "undo" };
    disarm();
    setPending(true);
    try {
      await props.onRemove();
    } catch {
      // the page says why; the press rests for another try
      handoff = null;
    } finally {
      setPending(false);
    }
  };
  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions: Escape and the focus leaving come up from its button */
    <span
      ref={host}
      class={styles.press}
      data-remove=""
      onFocusOut={disarm}
      onKeyDown={e => {
        if (e.key === "Escape" && armed()) {
          e.stopPropagation();
          disarm();
        }
      }}
    >
      <Button
        variant="art"
        icon={!armed() && !pending()}
        size="sm"
        disabled={props.disabled || pending()}
        keep
        aria-label={removeName(armed(), pending())}
        tip={removeName(armed(), pending())}
        onClick={e => void press(e)}
      >
        <Icon name="trash" size={13} />
        <Show when={armed() || pending()}>
          <span>{t(pending() ? msg("Removing…") : msg("Remove"))}</span>
        </Show>
      </Button>
    </span>
  );
}

/** Undo on a palette just taken out: puts it back where it stood. The focus goes back to the press that took it out
    once the card is itself again. */
export function UndoPress(props: {
  /** the palette in its view, as the collection held it */
  item: string;
  onUndo: () => Promise<void>;
  disabled?: boolean;
}) {
  const [pending, setPending] = createSignal(false);
  let host: HTMLSpanElement | undefined;
  onSettled(() => takeFocus(props.item, "undo", host));
  const press = async (e: MouseEvent) => {
    if (pending() || props.disabled) return;
    if (document.activeElement === e.currentTarget) handoff = { item: props.item, to: "remove" };
    setPending(true);
    try {
      await props.onUndo();
    } catch {
      // the page says why; the press stays for another try
      handoff = null;
    } finally {
      setPending(false);
    }
  };
  return (
    <span ref={host} class={styles.press} data-undo="">
      <Button
        variant="art"
        size="sm"
        disabled={props.disabled || pending()}
        keep
        onClick={e => void press(e)}
      >
        <Icon name="undo" size={13} />
        <span>{t("Undo")}</span>
      </Button>
    </span>
  );
}
