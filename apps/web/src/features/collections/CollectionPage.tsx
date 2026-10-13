import { decodePalette } from "@grabient/engine";
import { formatDate, localHref, msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { PaletteCount } from "@grabient/ui/CollectionGroup.tsx";
import { CollectPress } from "@grabient/ui/CollectPress.tsx";
import { Curation } from "@grabient/ui/Curation.tsx";
import { createDone } from "@grabient/ui/done.ts";
import { Field } from "@grabient/ui/Field.tsx";
import { Fit } from "@grabient/ui/Fit.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { Label } from "@grabient/ui/Label.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { PaletteGrid } from "@grabient/ui/PaletteGrid.tsx";
import { PaletteCardPlaceholder } from "@grabient/ui/PalettePlaceholder.tsx";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { RemovePress, UndoPress } from "@grabient/ui/RemovePress.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { Textarea } from "@grabient/ui/Textarea.tsx";
import { tooltip } from "@grabient/ui/Tooltip.tsx";
import { useQuery } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { createEffect, createMemo, createSignal, For, onSettled, Show } from "solid-js";
import { likeCount, liked, toggleLike } from "../account/likes.ts";
import { account, isAdmin } from "../account/session.ts";
import { selected, toggle } from "../selection/selection.ts";
import { collectionHref, type PaletteOrder, sortCollectionItems } from "./address.ts";
import {
  castVote,
  changeCollection,
  deleteCollection,
  deletePalette,
  inputOf,
  keyOf,
  readState,
  removePalette,
  restorePalette,
  saveCopy,
  setPaletteView,
  syncCopy
} from "./client.ts";
import { createChecklists, failedWrite } from "./collect.ts";
import styles from "./collections.module.css";
import { createDeletable } from "./deletable.ts";
import {
  drawnAs,
  hexesOf,
  minuteOf,
  nameOf,
  ownerLabel,
  paletteHref,
  relativeAge
} from "./drawing.ts";
import { Notes } from "./Notes.tsx";
import type { ListView } from "./params.ts";
import { listSearch, pageSearch } from "./params.ts";
import { collectionQuery, type Found, failed } from "./queries.ts";
import type { FitVote } from "./schema.ts";
import { DESCRIPTION_MAX, TITLE_MAX, type Visibility } from "./schema.ts";
import type {
  CollectionDocument,
  CollectionItem,
  CollectionNote,
  CopyStanding,
  ViewerState
} from "./types.ts";

/* One collection's page, at /{slug} and /{slug}/rising, or under its owner at /@{handle}/{slug}; its route draws a new
   one for each collection, so nothing of one collection's page stands on the next. The server draws a
   public collection whole; a private one is its owner's alone, so the server answers 404 naming it private, and the
   owner's browser fills it in from the account's own read. Once the reader is known, one read says what else they may
   do here: save a copy or bring one up to date, vote on each palette's fit, change their own (its words, who sees it,
   its palettes), and for an admin curate Grabient's and leave the agents notes. */

const ARM_MS = 4000;
/* a palette taken out stands faded, with Undo over it, this long before it leaves the grid */
const REMOVED_STAYS_MS = 6000;
const ORDERS: readonly { value: PaletteOrder; label: string }[] = [
  { value: "popular", label: msg("Popular", "order") },
  { value: "rising", label: msg("Rising", "order") }
];

interface Removal {
  item: CollectionItem;
  token: string | null;
}

export function CollectionPage(props: { slug: string; order: PaletteOrder; view: ListView }) {
  const navigate = useNavigate();
  const found = useQuery(() => collectionQuery(props.slug));
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal(false);
  const say = (message: string, isError = false) => {
    setNote(message);
    setError(isError);
  };
  /* what the account read of this collection, and every change the reader made since: newer than the public read */
  const [state, setState] = createSignal<
    (ViewerState & { collection?: CollectionDocument }) | null
  >(null);
  const [own, setOwn] = createSignal<CollectionDocument | null>(null);
  createEffect(
    () => [props.slug, account()?.id] as const,
    ([slug, who]) => {
      setState(null);
      setOwn(null);
      if (!who) return;
      let live = true;
      readState(slug).then(
        answer => {
          if (!live) return;
          setState(answer);
          if (answer.collection) setOwn(answer.collection);
        },
        () => {}
      );
      return () => {
        live = false;
      };
    }
  );
  const data = (): Found | null => (found.data && !failed(found.data) ? found.data : null);
  const doc = (): CollectionDocument | null => own() ?? data()?.doc ?? null;
  const readFailed = () => (failed(found.data) ? found.data.failed : "");
  /* the minute the page's data was read: the clock its ages are told against, the same for the server and hydration */
  const now = () => minuteOf(data()?.fetchedAt ?? Date.now());
  const owned = () => !!state()?.owned;
  const curating = () => !!state()?.canCurate && isAdmin();

  /* the palettes taken out while the page stands, each keeping its place a while, faded, with Undo over it */
  const [removals, setRemovals] = createSignal<ReadonlyMap<string, Removal>>(new Map());
  const leaving = new Map<string, ReturnType<typeof setTimeout>>();
  onSettled(() => () => {
    for (const timer of leaving.values()) clearTimeout(timer);
  });
  const showRemoved = (key: string, removal: Removal | null) => {
    clearTimeout(leaving.get(key));
    leaving.delete(key);
    setRemovals(shown => {
      const next = new Map(shown);
      if (removal) next.set(key, removal);
      else next.delete(key);
      return next;
    });
    if (!removal) return;
    /* it leaves once its time is up and nothing rests on it: a mouse over it, or the keyboard in it */
    const later = (after: number) =>
      leaving.set(
        key,
        setTimeout(() => {
          const card = document.querySelector(`[data-item="${CSS.escape(key)}"]`);
          const rested =
            !!card &&
            ((!matchMedia("(pointer: coarse)").matches && card.matches(":hover")) ||
              !!card.querySelector(":focus-visible"));
          if (rested) later(1000);
          else showRemoved(key, null);
        }, after)
      );
    later(REMOVED_STAYS_MS);
  };
  /* the palettes in the order the address says, by the likes the page was sent, so a like moves a count, never a card */
  const shown = createMemo(() => {
    const items = doc()?.items ?? [];
    const held = new Set(items.map(keyOf));
    const gone = [...removals().values()].map(r => r.item).filter(item => !held.has(keyOf(item)));
    return sortCollectionItems([...items, ...gone], props.order);
  });
  const removedKey = (item: CollectionItem) => {
    const key = keyOf(item);
    return removals().has(key) && !doc()?.items.some(i => keyOf(i) === key) ? key : null;
  };

  /* what the reader sees of the account's copies: their copy of this one, or this one as their copy */
  const [copy, setCopy] = createSignal<CopyStanding | null | undefined>(undefined);
  const standing = () => (copy() === undefined ? (state()?.copy ?? null) : copy()!);
  const savedCopy = () => {
    const held = standing();
    return held && !owned() && held.source.slug === props.slug ? held : null;
  };
  const savedFrom = () => {
    const held = standing();
    return held && owned() && held.slug === props.slug ? held : null;
  };

  const pageHref = (order: PaletteOrder) =>
    localHref(collectionHref(props.slug, order) + pageSearch(props.view));
  const follow = (slug: string) => {
    if (slug !== props.slug)
      void navigate({
        href: collectionHref(slug, props.order) + pageSearch(props.view),
        replace: true
      });
  };

  /* Save: the account's private copy, made once; signed out, the press leads to sign in and back */
  const [saving, setSaving] = createSignal(false);
  const save = async () => {
    if (account() === null) {
      location.assign(
        localHref(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      );
      return;
    }
    setSaving(true);
    say("");
    try {
      const answer = await saveCopy(props.slug);
      setCopy(answer.copy);
    } catch (reason) {
      say(failedWrite(reason, msg("Couldn't save the collection.")), true);
    } finally {
      setSaving(false);
    }
  };
  /* Update brings the source's changes into the copy and keeps its own; Reset makes the copy the source again, and asks
     a second press first */
  const [syncing, setSyncing] = createSignal<"update" | "reset" | null>(null);
  const [synced, markSynced] = createDone<"update">(1800);
  const [resetArmed, setResetArmed] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  onSettled(() => () => clearTimeout(resetTimer));
  const sync = async (mode: "update" | "reset") => {
    const held = standing();
    if (!held || syncing()) return;
    if (mode === "reset" && !resetArmed()) {
      setResetArmed(true);
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => setResetArmed(false), ARM_MS);
      return;
    }
    clearTimeout(resetTimer);
    setResetArmed(false);
    setSyncing(mode);
    say("");
    try {
      const answer = await syncCopy(held.slug, mode);
      setCopy(answer.copy);
      if (answer.collection.slug === props.slug) {
        setRemovals(new Map());
        setOwn(answer.collection);
      }
      if (mode === "update") markSynced("update");
    } catch (reason) {
      say(
        failedWrite(
          reason,
          mode === "update"
            ? msg("Couldn't update the collection.")
            : msg("Couldn't reset the collection.")
        ),
        true
      );
    } finally {
      setSyncing(null);
    }
  };

  /* who sees it, an admin's: the press turns at once, says it for a moment, and turns back if the write fails */
  const [turned, setTurned] = createSignal<Visibility | null>(null);
  const [changedTo, markChanged] = createDone<Visibility>(1800);
  const visibility = () => turned() ?? doc()?.visibility ?? "private";
  const turnVisibility = async () => {
    const current = doc();
    if (!current) return;
    const next: Visibility = visibility() === "public" ? "private" : "public";
    setTurned(next);
    markChanged(next);
    say("");
    try {
      const answer = await changeCollection(current.slug, { visibility: next });
      setOwn(answer.collection);
      follow(answer.collection.slug);
    } catch (reason) {
      say(failedWrite(reason), true);
    } finally {
      setTurned(null);
    }
  };

  /* deleting asks twice: the first press arms it for four seconds */
  const [armed, setArmed] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  onSettled(() => () => clearTimeout(armTimer));
  const remove = async () => {
    const current = doc();
    if (!current || deleting()) return;
    if (!armed()) {
      setArmed(true);
      clearTimeout(armTimer);
      armTimer = setTimeout(() => setArmed(false), ARM_MS);
      return;
    }
    clearTimeout(armTimer);
    setArmed(false);
    setDeleting(true);
    say("");
    const slug = current.slug;
    const destination = owned() ? "/collections/saved" : "/collections";
    try {
      await deleteCollection(slug);
      if (props.slug === slug) void navigate({ href: destination });
    } catch (reason) {
      if (props.slug === slug)
        say(failedWrite(reason, msg("Couldn't delete the collection.")), true);
    } finally {
      setDeleting(false);
    }
  };

  /* the owner's words, edited where the title stands: Enter saves, Escape lets them be */
  const [editing, setEditing] = createSignal(false);
  const [wordsBusy, setWordsBusy] = createSignal(false);
  const [wordsError, setWordsError] = createSignal("");
  let draft = { title: "", description: "" };
  const startEditing = () => {
    const current = doc();
    if (!current) return;
    draft = { title: current.title, description: current.description };
    setWordsError("");
    setEditing(true);
  };
  const saveWords = async () => {
    const current = doc();
    if (!current || wordsBusy()) return;
    const title = draft.title.trim();
    const description = draft.description.trim();
    if (title === current.title && description === current.description) {
      setEditing(false);
      return;
    }
    setWordsBusy(true);
    setWordsError("");
    try {
      const answer = await changeCollection(current.slug, { title, description });
      setOwn(answer.collection);
      setEditing(false);
      follow(answer.collection.slug);
    } catch (reason) {
      setWordsError(failedWrite(reason));
    } finally {
      setWordsBusy(false);
    }
  };

  /* the owner takes a palette out: it stays a while where it stood, faded, and its token puts it back */
  const [busyItem, setBusyItem] = createSignal("");
  const takeOut = async (item: CollectionItem) => {
    const current = doc();
    if (!current || busyItem()) return;
    setBusyItem(keyOf(item));
    say("");
    try {
      const answer = await removePalette(current.slug, inputOf(item));
      showRemoved(keyOf(item), { item, token: answer.restore ?? null });
      setOwn(answer.collection);
      say(t("Palette removed."));
    } catch (reason) {
      say(failedWrite(reason, msg("Couldn't remove the palette.")), true);
      throw reason;
    } finally {
      setBusyItem("");
    }
  };
  const putBack = async (key: string) => {
    const removal = removals().get(key);
    const current = doc();
    if (!removal || !current) return;
    setBusyItem(key);
    say("");
    try {
      if (!removal.token) throw new Error(t("This palette can't be put back."));
      const answer = await restorePalette(current.slug, removal.item.kseed, removal.token);
      showRemoved(key, null);
      setOwn(answer.collection);
      say(t("Palette put back."));
    } catch (reason) {
      say(failedWrite(reason, msg("Couldn't put the palette back.")), true);
      throw reason;
    } finally {
      setBusyItem("");
    }
  };

  /* an admin's curation of one of Grabient's: a palette drawn another way, or deleted everywhere */
  const deletable = createDeletable();
  createEffect(
    () => (curating() ? (doc()?.items ?? []).map(item => item.kseed) : []),
    seeds => {
      if (seeds.length) deletable.learn(seeds);
    }
  );
  const setView = async (
    item: CollectionItem,
    view: { style: string; steps: number; angle: number },
    why: object
  ) => {
    const current = doc();
    if (!current) return;
    const answer = await setPaletteView(current.slug, inputOf(item), view, why);
    setOwn(answer.collection);
    say(t("View saved."));
  };
  const deleteEverywhere = async (item: CollectionItem, why: object) => {
    const current = doc();
    if (!current) return;
    await deletePalette(item.kseed, why);
    const items = current.items.filter(entry => entry.kseed !== item.kseed);
    setOwn({ ...current, items, itemCount: items.length, updatedAt: Date.now() });
    say(t("Palette deleted."));
  };

  /* the reader's fit votes: a press shows at once, and a failure puts it back */
  const [votes, setVotes] = createSignal<Readonly<Record<string, FitVote>>>({});
  createEffect(
    () => state()?.votes,
    held => {
      setVotes(held ?? {});
    }
  );
  const vote = async (item: CollectionItem, next: FitVote | null) => {
    const current = doc();
    if (!current) return;
    if (account() === null) {
      location.assign(
        localHref(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`)
      );
      return;
    }
    const before = votes()[item.kseed] ?? null;
    const set = (to: FitVote | null) =>
      setVotes(all => {
        const { [item.kseed]: _, ...rest } = all;
        return to ? { ...rest, [item.kseed]: to } : rest;
      });
    set(next);
    try {
      await castVote(current.slug, item.kseed, next);
    } catch (reason) {
      set(before);
      say(failedWrite(reason, msg("Couldn't save your vote.")), true);
    }
  };

  const checklists = createChecklists(message => say(message));
  const draw = (item: CollectionItem) => drawnAs(inputOf(item), props.view);
  const allChosen = () => {
    const items = doc()?.items ?? [];
    return items.length > 0 && items.every(item => selected(item.kseed));
  };
  const chooseAll = () => {
    const items = doc()?.items ?? [];
    const all = allChosen();
    for (const item of items) if (selected(item.kseed) === all) toggle(item.kseed);
  };
  const tags = () =>
    (doc()?.tags ?? []).map(tag => ({
      label: tag,
      href: localHref(
        `/collections${props.order === "rising" ? "/rising" : ""}${listSearch({ query: tag, view: props.view })}`
      )
    }));
  const privateHere = () => !doc() && !!data()?.private && account() === null;
  const missing = () => !doc() && !!data() && !privateHere();
  const empty = () => !!doc() && !doc()!.items.length;
  const updatedOn = (at: number) =>
    t("Updated {date}", { date: formatDate(at, { dateStyle: "long" }) });
  const titleTip = tooltip(() => doc()?.description || undefined);
  const ageTip = tooltip(() => (doc() ? updatedOn(doc()!.updatedAt) : undefined));
  const deleteName = () => (armed() || deleting() ? undefined : t("Delete collection"));

  return (
    <main id="main" class={styles.page}>
      <div class={styles.band}>
        <div class={styles.back}>
          <Button
            size="sm"
            href={localHref(props.order === "rising" ? "/collections/rising" : "/collections")}
          >
            <Icon name="back" size={13} /> {t("Collections")}
          </Button>
        </div>
        <Show when={tags().length}>
          <nav class={styles.tags} aria-label={t("Tags")}>
            <For each={tags()} keyed={false}>
              {tag => (
                <a class={styles.tag} href={tag().href} dir="auto">
                  {tag().label}
                </a>
              )}
            </For>
          </nav>
        </Show>
      </div>
      <Show
        when={doc()}
        fallback={
          <div class={styles.words}>
            <Text variant="title" as="h1">
              {t(
                privateHere()
                  ? msg("This collection is private.")
                  : readFailed()
                    ? msg("Couldn't load this collection.")
                    : msg("Collection not found")
              )}
            </Text>
            <Show when={privateHere() || missing()}>
              <Text variant="lede">
                {privateHere()
                  ? rich("<signin>Sign in</signin> as its owner to see it.", {
                      signin: words => (
                        <a
                          class={styles.inline}
                          href={localHref(
                            `/login?redirect=${encodeURIComponent(collectionHref(props.slug, props.order))}`
                          )}
                        >
                          {words}
                        </a>
                      )
                    })
                  : t("It may have been deleted.")}
              </Text>
            </Show>
          </div>
        }
      >
        {current => (
          <>
            <div class={styles.row}>
              <div class={styles.order}>
                <Segmented
                  aria-label={t("Order")}
                  value={props.order}
                  options={ORDERS.map(o => ({
                    value: o.value,
                    label: t(o.label, { $context: "order" }),
                    href: pageHref(o.value)
                  }))}
                  onChange={value =>
                    void navigate({
                      href:
                        collectionHref(props.slug, value as PaletteOrder) + pageSearch(props.view),
                      resetScroll: false
                    })
                  }
                />
              </div>
              <div class={styles.actions}>
                <Button
                  icon
                  size="lg"
                  turns
                  aria-pressed={allChosen()}
                  aria-label={t(
                    allChosen() ? msg("Remove all from selection") : msg("Add all to selection")
                  )}
                  tip={t(
                    allChosen() ? msg("Remove all from selection") : msg("Add all to selection")
                  )}
                  disabled={!current().items.length}
                  onClick={chooseAll}
                >
                  <Icon name={allChosen() ? "check" : "plus"} size={15} />
                </Button>
                <Show when={!owned()}>
                  <Show
                    when={savedCopy()}
                    fallback={
                      <Button
                        icon
                        size="lg"
                        aria-label={t(saving() ? msg("Saving…") : msg("Save"))}
                        tip={t("Save")}
                        disabled={!current().items.length || saving() || deleting()}
                        onClick={() => void save()}
                      >
                        <Icon name="bookmark" size={15} />
                      </Button>
                    }
                  >
                    {held => (
                      <>
                        <Button
                          icon
                          size="lg"
                          href={localHref(collectionHref(held().slug))}
                          aria-label={t("Saved", { $context: "collection" })}
                          tip={t("Saved", { $context: "collection" })}
                        >
                          <Icon name="bookmark" size={15} fill />
                        </Button>
                        <Show when={held().behind || synced()}>
                          <Button
                            icon
                            size="lg"
                            aria-label={t(
                              synced()
                                ? msg("Updated")
                                : syncing()
                                  ? msg("Updating…")
                                  : msg("Update")
                            )}
                            tip={t("Update")}
                            disabled={!!syncing() || !!synced()}
                            onClick={() => void sync("update")}
                          >
                            <Icon name={synced() ? "check" : "refresh"} size={15} />
                          </Button>
                        </Show>
                      </>
                    )}
                  </Show>
                </Show>
                <Show when={savedFrom()}>
                  {held => (
                    <Show
                      when={held().behind || synced()}
                      fallback={
                        <Button
                          size="lg"
                          icon={!resetArmed() && !syncing()}
                          aria-label={resetArmed() || syncing() ? undefined : t("Reset")}
                          tip={t("Reset")}
                          disabled={!held().differs || !!syncing()}
                          onClick={() => void sync("reset")}
                        >
                          <Show
                            when={resetArmed() || syncing()}
                            fallback={<Icon name="reset" size={15} />}
                          >
                            {t(syncing() ? msg("Resetting…") : msg("Press again to reset"))}
                          </Show>
                        </Button>
                      }
                    >
                      <Button
                        icon
                        size="lg"
                        aria-label={t(
                          synced() ? msg("Updated") : syncing() ? msg("Updating…") : msg("Update")
                        )}
                        tip={t("Update")}
                        disabled={!!syncing() || !!synced()}
                        onClick={() => void sync("update")}
                      >
                        <Icon name={synced() ? "check" : "refresh"} size={15} />
                      </Button>
                    </Show>
                  )}
                </Show>
                <Show when={owned() && isAdmin()}>
                  <Button size="lg" onClick={() => void turnVisibility()}>
                    <Show when={changedTo() === visibility()}>
                      <Icon name="check" size={15} />{" "}
                    </Show>
                    {t(
                      changedTo() === visibility()
                        ? visibility() === "public"
                          ? msg("Now public")
                          : msg("Now private")
                        : visibility() === "public"
                          ? msg("Make private")
                          : msg("Make public")
                    )}
                  </Button>
                </Show>
                <Show when={state()?.canDelete}>
                  <Button
                    size="lg"
                    icon={!armed() && !deleting()}
                    danger
                    aria-label={deleteName()}
                    tip={t("Delete collection")}
                    disabled={deleting()}
                    onClick={() => void remove()}
                  >
                    <Show when={armed() || deleting()} fallback={<Icon name="trash" size={15} />}>
                      {t(deleting() ? msg("Deleting…") : msg("Press again to delete"))}
                    </Show>
                  </Button>
                </Show>
              </div>
            </div>
            <Show when={editing()}>
              <form
                class={styles.editor}
                onSubmit={e => {
                  e.preventDefault();
                  void saveWords();
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
                  disabled={wordsBusy()}
                  invalid={!!wordsError()}
                  help={wordsError() || undefined}
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
                  disabled={wordsBusy()}
                  onInput={value => {
                    draft.description = value;
                  }}
                />
                <div class={styles.editActions}>
                  <Button size="lg" disabled={wordsBusy()} onClick={() => setEditing(false)}>
                    {t("Cancel")}
                  </Button>
                  <Button size="lg" variant="primary" type="submit" disabled={wordsBusy()}>
                    {t(wordsBusy() ? msg("Saving…") : msg("Save"))}
                  </Button>
                </div>
              </form>
            </Show>
            <div class={styles.heading} data-gone={editing() ? "" : undefined}>
              <Text variant="title" as="h1">
                <span dir="auto" ref={titleTip}>
                  {current().title}
                </span>
              </Text>
              <Show when={owned() && current().owner.kind === "user"}>
                <span class={styles.edit}>
                  <Button
                    icon
                    variant="ghost"
                    aria-label={t("Edit")}
                    tip={t("Edit")}
                    onClick={startEditing}
                  >
                    <Icon name="edit" size={14} />
                  </Button>
                </span>
              </Show>
              <Show when={current().description}>
                <p class={styles.hidden} dir="auto">
                  {current().description}
                </p>
              </Show>
              <span class={styles.facts} data-saved={savedFrom() ? "" : undefined}>
                <Show when={visibility() === "private"}>
                  <Label>{t("Private")}</Label>
                </Show>
                <Show
                  when={savedFrom()}
                  fallback={
                    <>
                      <span class={styles.owner}>
                        <Text variant="ui">
                          <span dir="auto">{ownerLabel(current().owner, isAdmin())}</span>
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
                <time datetime={new Date(current().updatedAt).toISOString()} ref={ageTip}>
                  <Text variant="ui">{relativeAge(current().updatedAt, now())}</Text>
                </time>
                <Text variant="ui">·</Text>
                <PaletteCount count={current().itemCount} />
              </span>
            </div>
            <PaletteGrid>
              <For each={shown()} keyed={item => keyOf(item)}>
                {item => {
                  const palette = createMemo(() => draw(item()));
                  const stops = createMemo(() => hexesOf(palette().seed, palette().steps));
                  const collect = checklists.card(() => inputOf(item()));
                  const gone = () => removedKey(item());
                  return (
                    <div class={styles.cell} data-item={keyOf(item())}>
                      <PaletteCard
                        seed={item().kseed}
                        name={nameOf(palette())}
                        stops={stops()}
                        style={palette().style}
                        angle={palette().angle}
                        href={paletteHref(palette(), props.view.size)}
                        age={relativeAge(item().createdAt, now())}
                        likes={likeCount(item().kseed, item().likes)}
                        liked={liked(item().kseed)}
                        onLike={() =>
                          void toggleLike(item().kseed, !liked(item().kseed), {
                            collectionId: current().slug
                          })
                        }
                        selected={selected(item().kseed)}
                        onSelect={() => toggle(item().kseed)}
                        removed={!!gone()}
                        collect={<CollectPress collect={collect} />}
                        fit={
                          <Fit
                            value={votes()[item().kseed] ?? null}
                            admin={curating()}
                            collection={current().title}
                            onVote={next => void vote(item(), next)}
                          />
                        }
                        lead={
                          <Show
                            when={!gone()}
                            fallback={
                              <UndoPress onUndo={() => putBack(gone()!)} disabled={!!busyItem()} />
                            }
                          >
                            <Show when={owned() && current().owner.kind === "user"}>
                              <RemovePress
                                item={keyOf(item())}
                                onRemove={() => takeOut(item())}
                                disabled={!!busyItem()}
                              />
                            </Show>
                            <Show when={curating() && deletable.of(item().kseed) !== undefined}>
                              <Curation
                                mode="view"
                                icon="sliders"
                                blocked={
                                  deletable.of(item().kseed) ? undefined : t("Liked by someone")
                                }
                                stops={hexesOf(item().kseed, item().steps)}
                                view={inputOf(item())}
                                stopsAt={steps => hexesOf(item().kseed, steps)}
                                minSteps={decodePalette(item().kseed)?.anchors.length}
                                onConfirm={result =>
                                  setView(item(), result.view!, {
                                    reasons: result.reasons,
                                    comment: result.comment
                                  })
                                }
                              />
                              <Curation
                                mode="delete"
                                icon="trash"
                                blocked={
                                  deletable.of(item().kseed) ? undefined : t("Liked by someone")
                                }
                                stops={hexesOf(item().kseed, item().steps)}
                                view={inputOf(item())}
                                onConfirm={result =>
                                  deleteEverywhere(item(), {
                                    reasons: result.reasons,
                                    comment: result.comment
                                  })
                                }
                              />
                            </Show>
                          </Show>
                        }
                      />
                    </div>
                  );
                }}
              </For>
            </PaletteGrid>
          </>
        )}
      </Show>
      <Show when={!doc() && !data() && !readFailed()}>
        <div class={styles.heading}>
          <Placeholder width="320px" height="32px" />
        </div>
        <PaletteGrid>
          <For each={Array.from({ length: 6 }, (_, i) => i)}>
            {() => <PaletteCardPlaceholder />}
          </For>
        </PaletteGrid>
      </Show>
      <div class={styles.status}>
        <Status error={error() || !!readFailed()}>
          {readFailed() || note() || (empty() ? t("This collection is empty.") : "")}
        </Status>
        <Show when={readFailed()}>
          <Button size="sm" onClick={() => void found.refetch()}>
            {t("Retry")}
          </Button>
        </Show>
        <Show when={empty() && owned()}>
          <Button size="sm" href={localHref("/palettes")}>
            {t("Browse palettes")}
          </Button>
        </Show>
      </div>
      <Show when={isAdmin() && doc() && state()?.notes}>
        <Notes slug={props.slug} notes={state()!.notes as CollectionNote[]} now={now()} />
      </Show>
    </main>
  );
}
