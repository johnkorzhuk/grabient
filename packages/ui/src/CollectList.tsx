import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { Coins, coinHost } from "./Coins.tsx";
import styles from "./CollectList.module.css";
import { Icon } from "./Icon.tsx";
import { msg, t } from "./i18n.ts";
import joined from "./joined.module.css";
import { composing } from "./keys.ts";
import { Label } from "./Label.tsx";
import rows from "./rows.module.css";
import { Status } from "./Status.tsx";
import { Text } from "./Text.tsx";
import { dropTip, tooltip } from "./Tooltip.tsx";

/* The account's collections as a checklist, for the palettes at hand: one card's (Add to collection) or the selection's
   (the export column's Save). It is one piece wherever it stands. New collection heads it on the input recipe, and a
   press turns it, where it stands, into the title's field; one square press joined to its end closes or gives the field
   back, and once a title is typed it saves, so naming a collection brings no press of its own and the rows never move.
   A collection's row puts the palettes in, or takes them out once it holds them all; each pick is saved at once and
   shows its check, and the list stays for the next. Under the pointer or the keyboard a row shows its collection's
   colors. A group after the account's own (Grabient's, for an admin) is named over its first row; a long list is
   searched by its titles' words in a row of the list, which also finds the rows a group holds back. */

/** One of the account's collections, as the checklist offers it. */
export interface CollectChoice {
  slug: string;
  title: string;
  count: number;
  /** it holds the palettes at hand: all, some or none; left out where that is not known, and the picks made in the
      list are all it shows */
  has?: boolean | "some";
  /** one to five of its colors, shown under the pointer */
  colors?: readonly string[];
  /** the group it belongs to after the account's own, named over the group's first row */
  group?: string;
  /** one of many in its group: shown once a search's words find it */
  more?: boolean;
}

/** What a checklist is given: the collections, and the writes its picks make. */
export interface CollectSource {
  /** the account's collections; null while they are read */
  own: readonly CollectChoice[] | null;
  /** the palettes into that collection, or out of it; rejects with the reason to show */
  onToggle: (slug: string, on: boolean) => Promise<void>;
  /** a new collection holding the palettes */
  onNew: (title: string) => Promise<void>;
  /** a write landed: read the collections again */
  onChanged?: () => void;
  disabled?: boolean;
}

/* more rows than this, and the list is searched */
const SEARCH_FROM = 8;

/** A checklist while it stands: the title being typed, the write in flight, the picks and the last refusal. Its head
    and its rows read the same one, so they may stand apart. */
export function createCollect(source: CollectSource) {
  const [naming, setNaming] = createSignal(false);
  const [busy, setBusy] = createSignal("");
  const [error, setError] = createSignal("");
  /* where a collection's palettes are not known, each pick shows at once, stays while the list stands, and goes back
     when its write fails */
  const [picked, setPicked] = createSignal<ReadonlyMap<string, boolean>>(new Map());
  let title = "";
  const [typed, setTyped] = createSignal(false);
  const [words, setWords] = createSignal("");
  const stop = () => {
    title = "";
    setTyped(false);
    setNaming(false);
  };
  const has = (c: CollectChoice) => c.has ?? picked().get(c.slug) ?? false;
  const fold = (text: string) => text.normalize("NFKC").toLocaleLowerCase();
  /* the rows the words find, every word somewhere in the title; with none, every row a group does not hold back */
  const shown = createMemo(() => {
    const asked = fold(words()).split(/\s+/).filter(Boolean);
    const list = source.own ?? [];
    return asked.length
      ? list.filter(c => {
          const name = fold(c.title);
          return asked.every(word => name.includes(word));
        })
      : list.filter(c => !c.more);
  });
  const searchable = () =>
    (source.own?.length ?? 0) > SEARCH_FROM || !!source.own?.some(c => c.more);
  const failed = (reason: unknown) =>
    setError(reason instanceof Error && reason.message ? reason.message : t("Couldn't save."));
  const toggle = async (c: CollectChoice) => {
    if (busy() || source.disabled) return;
    const on = has(c) !== true;
    setPicked(m => new Map(m).set(c.slug, on));
    setBusy(c.slug);
    setError("");
    try {
      await source.onToggle(c.slug, on);
      source.onChanged?.();
    } catch (reason) {
      setPicked(m => {
        const next = new Map(m);
        next.delete(c.slug);
        return next;
      });
      failed(reason);
    } finally {
      setBusy("");
    }
  };
  const make = async () => {
    const name = title.trim();
    if (!name || busy() || source.disabled) return;
    setBusy("new");
    setError("");
    try {
      await source.onNew(name);
      stop();
      source.onChanged?.();
    } catch (reason) {
      failed(reason);
    } finally {
      setBusy("");
    }
  };
  return {
    naming,
    typed,
    busy,
    error,
    words,
    shown,
    searchable,
    has,
    toggle,
    make,
    stop,
    disabled: () => !!source.disabled,
    start: () => setNaming(true),
    type: (value: string) => {
      title = value;
      setTyped(!!value.trim());
    },
    find: setWords,
    /** something stands under the head: rows, the search that reaches them, or why a write failed */
    listed: () => shown().length > 0 || searchable() || !!error()
  };
}
export type Collect = ReturnType<typeof createCollect>;

/** A checklist's head: New collection, which a press turns into the title's field, and the square press joined to its
    end. Hung from a press, that one stands where the press stood and closes the list; in a column it comes with the
    field and gives the field back. With a title typed it saves, in both. */
export function CollectHead(props: {
  c: Collect;
  /** the head hangs from a press: its end closes the list and takes the focus as the list opens */
  onClose?: () => void;
  /** over a card's picture: the small press's height and corners */
  small?: boolean;
  /** rows are joined under the head: its lower corners are square */
  over?: boolean;
}) {
  const c = props.c;
  const ended = () => !!props.onClose || c.naming();
  const waits = () => c.typed() && (c.busy() === "new" || c.disabled());
  const end = () => t(c.typed() ? msg("Save") : props.onClose ? msg("Close") : msg("Cancel"));
  /* the end's meaning changes under a resting pointer: an open tip goes, and the next rest reads anew */
  let press: HTMLButtonElement | undefined;
  createEffect(c.typed, () => {
    if (press) dropTip(press);
  });
  /* the keyboard follows the field: into it as it comes, back to New collection as it goes with the focus in it */
  let named = false;
  const back = (el: HTMLElement) => {
    if (!named) return;
    named = false;
    setTimeout(() => {
      if (!document.activeElement || document.activeElement === document.body)
        el.focus({ preventScroll: true });
    }, 0);
  };
  const tip = tooltip(end);
  return (
    <div class={styles.head}>
      <form
        class={[joined.part, styles.grow]}
        onSubmit={e => {
          e.preventDefault();
          void c.make();
        }}
      >
        <Show
          when={c.naming()}
          fallback={
            <button
              ref={back}
              type="button"
              class={styles.make}
              data-joined={ended() ? "" : undefined}
              data-flush={props.onClose ? undefined : ""}
              data-small={props.small ? "" : undefined}
              data-over={props.over ? "" : undefined}
              disabled={!!c.busy() || c.disabled()}
              onClick={c.start}
            >
              <span class={styles.mark}>
                <Icon name="plus" size={14} />
              </span>
              <span class={styles.title}>{t("New collection")}</span>
            </button>
          }
        >
          {/* the title is the reader's own words; Enter saves, and Escape gives the field back to New collection */}
          <input
            ref={el => {
              named = true;
              setTimeout(() => el.focus({ preventScroll: true }), 0);
            }}
            class={[styles.make, styles.field]}
            data-joined=""
            data-flush={props.onClose ? undefined : ""}
            data-small={props.small ? "" : undefined}
            data-over={props.over ? "" : undefined}
            type="text"
            name="title"
            aria-label={t("Title")}
            placeholder={t("Title")}
            maxlength={80}
            autocomplete="off"
            spellcheck={false}
            enterkeyhint="done"
            dir={c.typed() ? "auto" : undefined}
            disabled={c.busy() === "new" || c.disabled()}
            onInput={e => c.type(e.currentTarget.value)}
            onKeyDown={e => {
              if (e.key === "Escape" && !composing(e)) {
                e.stopPropagation();
                c.stop();
              }
            }}
          />
        </Show>
      </form>
      <Show when={ended()}>
        <span class={joined.part}>
          <button
            type="button"
            class={joined.end}
            data-size={props.small ? "sm" : undefined}
            data-over={props.over ? "" : undefined}
            data-on={c.typed() ? "" : undefined}
            aria-label={end()}
            disabled={waits()}
            ref={el => {
              press = el;
              tip(el);
              if (props.onClose) setTimeout(() => el.focus({ preventScroll: true }), 0);
            }}
            onClick={() => {
              if (c.typed()) void c.make();
              else if (props.onClose) props.onClose();
              else c.stop();
            }}
          >
            <Icon name={c.typed() ? "save" : "close"} size={props.small ? 13 : 15} />
          </button>
        </span>
      </Show>
    </div>
  );
}

/** A checklist's rows under its head: the search that reaches them where they are many, each collection, and why a
    write failed. Nothing at all while there is none of those. */
export function CollectRows(props: { c: Collect; small?: boolean; flush?: boolean }) {
  const c = props.c;
  return (
    <Show when={c.listed()}>
      <div class={styles.list} data-flush={props.flush ? "" : undefined}>
        <Show when={c.searchable()}>
          {/* the words searched read in their own direction; text an input method composes counts once committed */}
          <label class={styles.seek} data-small={props.small ? "" : undefined}>
            <span class={styles.mark}>
              <Icon name="search" size={14} />
            </span>
            <input
              class={styles.seekField}
              type="search"
              name="q"
              aria-label={t("Search collections")}
              placeholder={t("Search collections")}
              autocomplete="off"
              spellcheck={false}
              enterkeyhint="search"
              dir={c.words() ? "auto" : undefined}
              disabled={c.disabled()}
              onInput={e => {
                if (!e.isComposing) c.find(e.currentTarget.value);
              }}
            />
          </label>
          <Show when={c.shown().length}>
            <div class={styles.rule} />
          </Show>
        </Show>
        <For each={c.shown()} keyed={false}>
          {(row, i) => (
            <>
              <Show when={row().group && row().group !== c.shown()[i - 1]?.group}>
                <Show when={i > 0}>
                  <div class={styles.rule} />
                </Show>
                <div class={styles.group}>
                  <Label>{row().group}</Label>
                </div>
              </Show>
              <button
                type="button"
                class={[rows.row, styles.row, coinHost]}
                data-small={props.small ? "" : undefined}
                data-flush={props.flush ? "" : undefined}
                data-held={c.has(row()) === true ? "" : undefined}
                aria-pressed={
                  c.has(row()) === true ? "true" : c.has(row()) === "some" ? "mixed" : "false"
                }
                disabled={!!c.busy() || c.disabled()}
                onClick={() => void c.toggle(row())}
              >
                <span class={styles.mark}>
                  <Show when={c.has(row())}>
                    <Icon name={c.has(row()) === true ? "check" : "minus"} size={14} />
                  </Show>
                </span>
                <span class={styles.title} dir="auto">
                  {row().title}
                </span>
                <Coins variant="row" colors={row().colors} />
                <span class={[rows.detail, styles.count]}>{row().count}</span>
              </button>
            </>
          )}
        </For>
        <Show when={c.words().trim() && !c.shown().length}>
          <div class={styles.none}>
            <Text variant="ui">{t("No results.")}</Text>
          </div>
        </Show>
        <Show when={c.error()}>
          <Status error>{c.error()}</Status>
        </Show>
      </div>
    </Show>
  );
}

/** The checklist as one piece: its head, and its rows joined under it. Hung from a press (`onClose`), the press gives
    it its place and its shadow, and a long list scrolls in itself; in a column it is as wide as the fields around it. */
export function CollectPiece(props: { c: Collect; onClose?: () => void; small?: boolean }) {
  return (
    <>
      <CollectHead
        c={props.c}
        onClose={props.onClose}
        small={props.small}
        over={props.c.listed()}
      />
      <Show when={props.c.listed()}>
        <div
          class={styles.under}
          data-hung={props.onClose ? "" : undefined}
          data-small={props.small ? "" : undefined}
        >
          <CollectRows c={props.c} small={props.small} flush={!props.onClose} />
        </div>
      </Show>
    </>
  );
}

/** The checklist in a column, among its fields (the export column's Save). */
export function CollectList(props: CollectSource) {
  const c = createCollect(props);
  return (
    <div class={styles.piece}>
      <CollectPiece c={c} />
    </div>
  );
}
