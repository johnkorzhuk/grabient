import { formatDate, localHref, msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { PaletteCount } from "@grabient/ui/CollectionGroup.tsx";
import { Field } from "@grabient/ui/Field.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Label } from "@grabient/ui/Label.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { Textarea } from "@grabient/ui/Textarea.tsx";
import { tooltip } from "@grabient/ui/Tooltip.tsx";
import { createSignal, Show } from "solid-js";
import { collectionHref } from "./address.ts";
import { failedWrite } from "./collect.ts";
import styles from "./collections.module.css";
import { ownerLabel, relativeAge } from "./drawing.ts";
import { DESCRIPTION_MAX, TITLE_MAX } from "./schema.ts";
import type { CollectionDocument, CopyStanding } from "./types.ts";

/* A collection's heading: its title, with the description as the title's tooltip and in a paragraph for a screen
   reader, then the byline: Private, who made it (or, on the owner's saved copy, where it was saved from), its age and
   how many palettes it holds. The owner of an account's collection edits its words here: the title and the
   description stand in the heading's place, Enter saves and Escape lets them be. */

export function Heading(props: {
  doc: CollectionDocument;
  /** who sees it, as the page shows it while a change is on its way */
  visibility: CollectionDocument["visibility"];
  /** the account's saved copy, on the copy's own page */
  savedFrom: CopyStanding | null;
  /** the clock its age is told against */
  now: number;
  admin: boolean;
  /** the owner of an account's collection, who may edit its words */
  editable: boolean;
  /** writes new words; rejects with the reason to show */
  onWords: (words: { title: string; description: string }) => Promise<void>;
}) {
  const [editing, setEditing] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal("");
  let draft = { title: "", description: "" };
  const start = () => {
    draft = { title: props.doc.title, description: props.doc.description };
    setError("");
    setEditing(true);
  };
  const save = async () => {
    if (busy()) return;
    const title = draft.title.trim();
    const description = draft.description.trim();
    if (title === props.doc.title && description === props.doc.description)
      return setEditing(false);
    setBusy(true);
    setError("");
    try {
      await props.onWords({ title, description });
      setEditing(false);
    } catch (reason) {
      setError(failedWrite(reason));
    } finally {
      setBusy(false);
    }
  };
  const titleTip = tooltip(() => props.doc.description || undefined);
  const ageTip = tooltip(() =>
    t("Updated {date}", { date: formatDate(props.doc.updatedAt, { dateStyle: "long" }) })
  );

  return (
    <>
      <Show when={editing()}>
        <form
          class={styles.editor}
          onSubmit={e => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={e => {
            if (e.key === "Escape") setEditing(false);
          }}
        >
          <Field
            label={t("Title")}
            name="title"
            value={draft.title}
            maxlength={TITLE_MAX}
            required
            disabled={busy()}
            invalid={!!error()}
            help={error() || undefined}
            onInput={value => {
              draft.title = value;
            }}
          />
          <Textarea
            label={t("Description")}
            name="description"
            value={draft.description}
            rows={3}
            maxlength={DESCRIPTION_MAX}
            disabled={busy()}
            onInput={value => {
              draft.description = value;
            }}
          />
          <div class={styles.editActions}>
            <Button size="lg" disabled={busy()} onClick={() => setEditing(false)}>
              {t("Cancel")}
            </Button>
            <Button size="lg" variant="primary" type="submit" disabled={busy()}>
              {t(busy() ? msg("Saving…") : msg("Save"))}
            </Button>
          </div>
        </form>
      </Show>
      <div class={styles.heading} data-gone={editing() ? "" : undefined}>
        <Text variant="title" as="h1">
          <span dir="auto" ref={titleTip}>
            {props.doc.title}
          </span>
        </Text>
        <Show when={props.editable}>
          <span class={styles.edit}>
            <Button icon variant="ghost" aria-label={t("Edit")} tip={t("Edit")} onClick={start}>
              <Icon name="edit" size={14} />
            </Button>
          </span>
        </Show>
        <Show when={props.doc.description}>
          <p class={styles.hidden} dir="auto">
            {props.doc.description}
          </p>
        </Show>
        <span class={styles.facts} data-saved={props.savedFrom ? "" : undefined}>
          <Show when={props.visibility === "private"}>
            <Label>{t("Private")}</Label>
          </Show>
          <Show
            when={props.savedFrom}
            fallback={
              <>
                <span class={styles.owner}>
                  <Text variant="ui">
                    <span dir="auto">{ownerLabel(props.doc.owner, props.admin)}</span>
                  </Text>
                </span>
                <Text variant="ui">·</Text>
              </>
            }
          >
            {held => (
              <>
                <span class={styles.from}>
                  <Text variant="ui">
                    {rich(
                      "Saved from <source>{title}</source>",
                      {
                        source: words => (
                          <a
                            class={styles.source}
                            href={localHref(collectionHref(held().source.slug))}
                            dir="auto"
                          >
                            {words}
                          </a>
                        )
                      },
                      { title: held().source.title }
                    )}
                  </Text>
                </span>
                <span class={styles.wide}>
                  <Text variant="ui">·</Text>
                </span>
              </>
            )}
          </Show>
          <time datetime={new Date(props.doc.updatedAt).toISOString()} ref={ageTip}>
            <Text variant="ui">{relativeAge(props.doc.updatedAt, props.now)}</Text>
          </time>
          <Text variant="ui">·</Text>
          <PaletteCount count={props.doc.itemCount} />
        </span>
      </div>
    </>
  );
}
