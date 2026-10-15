import { createSignal, createUniqueId, onSettled, Show } from "solid-js";
import { Button } from "./Button.tsx";
import { type CollectChoice, CollectPiece, createCollect } from "./CollectList.tsx";
import styles from "./CollectPress.module.css";
import { focusLeft } from "./dismiss.ts";
import { Icon } from "./Icon.tsx";
import { t } from "./i18n.ts";
import { composing } from "./keys.ts";

/** The account's collections for the one palette at hand. */
export interface CardCollect {
  /** the account's collections, each saying whether it holds the palette; null while they are read */
  own: readonly CollectChoice[] | null;
  /** read them again: the list opened */
  onOpen: () => void;
  /** read them again after a write, each where it stands: onOpen where it is not given */
  onChanged?: () => void;
  /** the palette into that collection, or out of it; rejects with the reason to show */
  onToggle: (slug: string, on: boolean) => Promise<void>;
  /** a new collection holding the palette */
  onNew: (title: string) => Promise<void>;
  /** signed out: the press leads here */
  signIn?: string;
  /** signed out and offline: the press needs the server and there is none */
  disabled?: boolean;
}

/* the press, open: a checklist of its own each time, so a title half typed never waits in a closed one */
function Opened(props: { collect: CardCollect; small: boolean; id: string; onClose: () => void }) {
  const c = createCollect({
    get own() {
      return props.collect.own;
    },
    onToggle: (slug, on) => props.collect.onToggle(slug, on),
    onNew: title => props.collect.onNew(title),
    onChanged: () => (props.collect.onChanged ?? props.collect.onOpen)()
  });
  return (
    <div
      class={styles.open}
      data-small={props.small ? "" : undefined}
      role="dialog"
      aria-label={t("Add to collection")}
      data-keys="menu"
      id={props.id}
    >
      <CollectPiece c={c} onClose={props.onClose} small={props.small} />
    </div>
  );
}

/** Add to collection, for the palette at hand: a press on glass over its picture, under the check that says the palette
    is in the selection, on a card and on the editor's stage alike. Pressed, it stays one piece: it turns to Close where
    it stands, joined to the end of New collection, and the account's collections hang under the two. Close, a press
    elsewhere, the keyboard leaving it or Escape puts the press back, and the keyboard with it. A title being typed
    takes the first Escape, which gives the field back to New collection. Signed out, it leads to sign in. */
export function CollectPress(props: {
  collect: CardCollect;
  /** the height of the check it stands under: sm over a card's picture, lg on the editor's stage */
  size?: "sm" | "lg";
}) {
  const [open, setOpen] = createSignal(false);
  const id = createUniqueId();
  let host!: HTMLSpanElement;
  const close = (back = true) => {
    setOpen(false);
    if (back)
      setTimeout(
        () =>
          host
            .querySelector<HTMLElement>(":scope > a, :scope > button")
            ?.focus({ preventScroll: true }),
        0
      );
  };
  onSettled(() => {
    const away = (e: Event) => {
      if (open() && !host.contains(e.target as Node)) close(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !open() || composing(e)) return;
      const at = e.target;
      if (at instanceof HTMLInputElement && at.name === "title" && host.contains(at)) return;
      e.stopPropagation();
      close(host.contains(document.activeElement));
    };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", onEscape, true);
    return () => {
      document.removeEventListener("pointerdown", away, true);
      document.removeEventListener("keydown", onEscape, true);
    };
  });
  return (
    <span
      ref={host}
      class={styles.host}
      data-size={props.size ?? "sm"}
      onFocusOut={e => {
        if (open() && focusLeft(e, host)) close(false);
      }}
    >
      <Show
        when={open()}
        fallback={
          <Button
            variant="art"
            icon
            size={props.size ?? "sm"}
            href={props.collect.signIn}
            aria-label={t("Add to collection")}
            tip={t("Add to collection")}
            aria-expanded={props.collect.signIn ? undefined : false}
            disabled={props.collect.disabled}
            onClick={() => {
              if (props.collect.signIn) return;
              props.collect.onOpen();
              setOpen(true);
            }}
          >
            <Icon name="collection" size={props.size === "lg" ? 15 : 13} />
          </Button>
        }
      >
        <Opened
          collect={props.collect}
          small={props.size !== "lg"}
          id={id}
          onClose={() => close()}
        />
      </Show>
    </span>
  );
}
