import { msg, t } from "@grabient/i18n";
import { announce } from "@grabient/ui/announce.ts";
import { Button } from "@grabient/ui/Button.tsx";
import { KEYMAP, type KeyMapRow, type KeyScope } from "@grabient/ui/keymap.ts";
import {
  anyKeyChanged,
  conflictOf,
  keyChanged,
  keyProblem,
  loadKeyOverrides,
  platform,
  recordKey,
  resetKeys,
  rowKeys,
  setKeyFor,
  showKey
} from "@grabient/ui/keys.ts";
import { Text } from "@grabient/ui/Text.tsx";
import { tooltip } from "@grabient/ui/Tooltip.tsx";
import { createSignal, For, onCleanup, onSettled, Show } from "solid-js";
import { isAdmin } from "../account/session.ts";
import styles from "./Bindings.module.css";

/* /bindings: the key map as a page. A key that can change is a press that records the next chord; a change is kept in
   this browser, and every key the site answers to and the ? list read it at once. The keys are drawn as the server
   drew them (Windows's) until the page is live, then as the reader's keyboard prints them. */

const GROUPS: readonly [KeyScope, string][] = [
  ["Every route", msg("Everywhere")],
  ["Editor", msg("Editor")]
];
const changeable = (row: KeyMapRow) => !row.fixed;

export function BindingsPage() {
  const [live, setLive] = createSignal(false);
  /* which row, and which of its keys, is listening */
  const [recording, setRecording] = createSignal<{ id: string; at: number } | null>(null);
  const [note, setNote] = createSignal<{ id: string; text: string } | null>(null);
  let stop: (() => void) | null = null;
  onSettled(() => {
    loadKeyOverrides();
    setLive(true);
  });
  onCleanup(() => stop?.());
  const shown = (chord: string) => showKey(chord, live() ? platform() : "windows");
  /* focus stays on the key being changed: the chip and Press a key are separate presses, so it goes to whichever is
     shown, and to the row's first key once its Reset goes */
  const focusKey = (id: string, at = 0) =>
    setTimeout(() =>
      document
        .querySelector<HTMLElement>(`[data-key-row="${CSS.escape(id)}"][data-key-at="${at}"]`)
        ?.focus()
    );
  const press = (row: KeyMapRow, at: number) => {
    stop?.();
    setNote(null);
    setRecording({ id: row.id, at });
    focusKey(row.id, at);
    announce(t("Press a key"));
    stop = recordKey(chord => {
      stop = null;
      setRecording(null);
      focusKey(row.id, at);
      if (chord === null) return;
      const problem = keyProblem(chord);
      if (problem) return setNote({ id: row.id, text: problem });
      const keys = rowKeys(row);
      if (keys.some((k, j) => j !== at && k === chord))
        return setNote({
          id: row.id,
          text: t("{key} is already on this row.", { key: showKey(chord) })
        });
      const other = conflictOf(row.id, chord, KEYMAP);
      if (other)
        return setNote({
          id: row.id,
          text: t("{key} is used by {action}.", { key: showKey(chord), action: t(other.label) })
        });
      setKeyFor(
        row.id,
        keys.map((k, j) => (j === at ? chord : k))
      );
      announce(showKey(chord));
    });
  };
  /* Reset all goes with nothing left to reset: the keyboard goes to the first key on the page */
  const resetAll = () => {
    resetKeys();
    setTimeout(() => document.querySelector<HTMLElement>("[data-key-row]")?.focus());
  };
  return (
    <article class={styles.article}>
      <header class={styles.head}>
        <div class={styles.headText}>
          <Text variant="title" as="h1">
            {t("Shortcuts")}
          </Text>
          <Text variant="lede">{t("Press a shortcut to change it.")}</Text>
        </div>
        {/* the place keeps its width, so the lede never reflows when Reset all comes */}
        <div class={styles.headAct} data-off={anyKeyChanged() ? undefined : ""}>
          <Button variant="ghost" size="sm" onClick={resetAll}>
            {t("Reset all")}
          </Button>
        </div>
      </header>
      <For each={GROUPS} keyed={false}>
        {group => (
          <section class={styles.group}>
            <Text variant="h2">{t(group()[1])}</Text>
            <div class={styles.rows}>
              <For
                each={KEYMAP.filter(k => k.scope === group()[0] && (!k.admin || isAdmin()))}
                keyed={false}
              >
                {row => (
                  <div class={styles.row}>
                    <span class={styles.keys}>
                      <Show
                        when={changeable(row())}
                        fallback={
                          <For each={row().keys} keyed={false}>
                            {chord => (
                              <kbd class={styles.kbd} dir="ltr">
                                {shown(chord())}
                              </kbd>
                            )}
                          </For>
                        }
                      >
                        <For each={rowKeys(row())} keyed={false}>
                          {(chord, at) => (
                            <Show
                              when={recording()?.id === row().id && recording()?.at === at}
                              fallback={
                                /* named by the key it shows, which a reader who speaks to the page can say, and
                                   described by what it does */
                                <button
                                  type="button"
                                  class={styles.press}
                                  dir="ltr"
                                  aria-describedby={`key-${row().id}`}
                                  data-key-row={row().id}
                                  data-key-at={at}
                                  ref={tooltip(() => t("Change key"))}
                                  onClick={() => press(row(), at)}
                                >
                                  {shown(chord())}
                                </button>
                              }
                            >
                              <button
                                type="button"
                                class={styles.press}
                                data-live=""
                                aria-describedby={`key-${row().id}`}
                                data-key-row={row().id}
                                data-key-at={at}
                                onClick={() => stop?.()}
                              >
                                {t("Press a key")}
                              </button>
                            </Show>
                          )}
                        </For>
                      </Show>
                    </span>
                    <span class={styles.what}>
                      <span class={styles.action} id={`key-${row().id}`}>
                        <Text variant="ui">{t(row().label)}</Text>
                      </span>
                      <Show when={note()?.id === row().id && note()}>
                        {said => (
                          <span role="alert">
                            <Text variant="ui" danger>
                              {said().text}
                            </Text>
                          </span>
                        )}
                      </Show>
                    </span>
                    <span class={styles.reset}>
                      <Show when={changeable(row()) && keyChanged(row().id)}>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-describedby={`key-${row().id}`}
                          onClick={() => {
                            setKeyFor(row().id, null);
                            focusKey(row().id);
                          }}
                        >
                          {t("Reset")}
                        </Button>
                      </Show>
                    </span>
                  </div>
                )}
              </For>
            </div>
          </section>
        )}
      </For>
    </article>
  );
}
