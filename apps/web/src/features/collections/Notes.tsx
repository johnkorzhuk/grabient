import { msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { Textarea } from "@grabient/ui/Textarea.tsx";
import { createSignal, For, Show, untrack } from "solid-js";
import { relativeAge } from "../gallery/drawing.ts";
import { addNote, removeNote } from "./client.ts";
import { failedWrite } from "./collect.ts";
import styles from "./collections.module.css";
import { NOTE_MAX } from "./schema.ts";
import type { CollectionNote } from "./types.ts";

/* What an admin tells the seeding agents about a collection, at its page's foot: admins alone see it. A note keeps the
   palettes the collection held when it was written, and its line says so once they change, so no agent reads it
   against a set it did not judge. A note taken back leaves at once, and comes back in its place if the server
   refuses. */

/** One line on a note saying what it is about: the palettes now, or the set it was written over and what changed. */
function about(note: CollectionNote): string | undefined {
  if (note.heldThen == null) return undefined;
  if (!note.changedSince && !note.addedSince) return t("About the palettes now");
  return note.addedSince
    ? t(
        "Written over {held, plural, one {# palette} other {# palettes}}; {replaced, plural, one {# since replaced} other {# since replaced}}, {added, plural, one {# added} other {# added}}",
        { held: note.heldThen, replaced: note.changedSince ?? 0, added: note.addedSince }
      )
    : t(
        "Written over {held, plural, one {# palette} other {# palettes}}; {replaced, plural, one {# since replaced} other {# since replaced}}",
        { held: note.heldThen, replaced: note.changedSince ?? 0 }
      );
}

export function Notes(props: { slug: string; notes: readonly CollectionNote[]; now: number }) {
  const [notes, setNotes] = createSignal<readonly CollectionNote[]>(untrack(() => props.notes));
  const [text, setText] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal("");
  const add = async () => {
    const value = text().trim();
    if (!value || pending()) return;
    setPending(true);
    setError("");
    try {
      const { note } = await addNote(props.slug, value);
      setNotes(list => [...list, note]);
      setText("");
    } catch (reason) {
      setError(failedWrite(reason, msg("Couldn't add the note.")));
    } finally {
      setPending(false);
    }
  };
  const remove = async (note: CollectionNote) => {
    setError("");
    setNotes(list => list.filter(n => n.id !== note.id));
    try {
      await removeNote(props.slug, note.id);
    } catch (reason) {
      setNotes(list =>
        [...list, note].sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
      );
      setError(failedWrite(reason, msg("Couldn't remove the note.")));
    }
  };
  return (
    <section class={styles.notes} aria-label={t("Notes for the agents")}>
      <Text variant="h3" as="h2">
        {t("Notes for the agents")}
      </Text>
      <Text variant="small">{t("Seeding agents read these notes before they write again.")}</Text>
      <Show when={notes().length}>
        <ul class={styles.noteList}>
          <For each={notes()} keyed={note => note.id}>
            {note => (
              <li class={styles.note}>
                <Text variant="body" dir="auto">
                  {note().text}
                </Text>
                <span class={styles.noteLine}>
                  <Text variant="small" as="span" dir="auto">
                    {note().author}
                  </Text>
                  <Text variant="small" as="span">
                    ·
                  </Text>
                  <Text variant="small" as="span">
                    {relativeAge(note().createdAt, props.now)}
                  </Text>
                  <Show when={about(note())}>
                    {line => (
                      <>
                        <Text variant="small" as="span">
                          ·
                        </Text>
                        <Text variant="small" as="span">
                          {line()}
                        </Text>
                      </>
                    )}
                  </Show>
                  <span class={styles.spacer} />
                  <Button size="sm" onClick={() => void remove(note())}>
                    {t("Remove")}
                  </Button>
                </span>
              </li>
            )}
          </For>
        </ul>
      </Show>
      <Textarea
        label={t("Note")}
        name="note"
        value={text()}
        rows={3}
        maxlength={NOTE_MAX}
        placeholder={t(
          "Too few stops on the gradients; keep the first three; no more sunset titles."
        )}
        disabled={pending()}
        onInput={setText}
      />
      <div class={styles.noteRow}>
        <Status error={!!error()}>{error()}</Status>
        <span class={styles.spacer} />
        <Button variant="primary" disabled={!text().trim() || pending()} onClick={() => void add()}>
          {t(pending() ? msg("Adding…") : msg("Add note"))}
        </Button>
      </div>
    </section>
  );
}
