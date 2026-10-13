import { createSignal, Show } from "solid-js";
import { Button } from "./Button.tsx";
import { Icon } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import styles from "./RemovePress.module.css";

/* A collection owner's Remove from collection over a card's picture, beside Edit, and the Undo a removed card shows. The
   press confirms on itself: the first press arms it for ARM_MS, the second takes the palette out. One card is armed at a
   time, by its item, so the arming follows its palette when the order moves it; time, Escape or the focus leaving
   disarm it. */

const ARM_MS = 4000;
const [armedItem, setArmedItem] = createSignal<string | null>(null);
let armTimer: ReturnType<typeof setTimeout> | undefined;

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
  const armed = () => armedItem() === props.item;
  const disarm = () => {
    if (!armed()) return;
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
    /* the focus stays where it was: on this press after a failure, on the removed card's Undo once it is out */
    const el = e.currentTarget as HTMLElement;
    const card = el.closest("article");
    const focused = document.activeElement === el;
    disarm();
    setPending(true);
    try {
      await props.onRemove();
    } catch {
      // the page says why; the press rests for another try
    } finally {
      setPending(false);
      if (focused)
        setTimeout(
          () =>
            (el.isConnected ? el : card?.querySelector<HTMLElement>("[data-undo] button"))?.focus({
              preventScroll: true
            }),
          0
        );
    }
  };
  return (
    /* biome-ignore lint/a11y/noStaticElementInteractions: Escape and the focus leaving come up from its button */
    <span
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
export function UndoPress(props: { onUndo: () => Promise<void>; disabled?: boolean }) {
  const [pending, setPending] = createSignal(false);
  const press = async (e: MouseEvent) => {
    if (pending() || props.disabled) return;
    const card = (e.currentTarget as HTMLElement).closest("article");
    const focused = document.activeElement === e.currentTarget;
    setPending(true);
    try {
      await props.onUndo();
    } catch {
      // the page says why; the press stays for another try
    } finally {
      setPending(false);
      if (focused)
        setTimeout(
          () =>
            card
              ?.querySelector<HTMLElement>("[data-remove] button, [data-undo] button")
              ?.focus({ preventScroll: true }),
          0
        );
    }
  };
  return (
    <span class={styles.press} data-undo="">
      <Button
        variant="art"
        size="sm"
        disabled={props.disabled || pending()}
        onClick={e => void press(e)}
      >
        <Icon name="undo" size={13} />
        <span>{t("Undo")}</span>
      </Button>
    </span>
  );
}
