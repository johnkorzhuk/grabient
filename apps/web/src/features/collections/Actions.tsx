import { localHref, msg, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { createDone } from "@grabient/ui/done.ts";
import { Icon } from "@grabient/ui/Icon.tsx";
import { createEffect, createSignal, type Element, onSettled, Show } from "solid-js";
import { offline } from "../../app/connection.ts";
import { record } from "../../app/undo.ts";
import type { Drawn } from "../../lib/palette.ts";
import {
  deleteOwnCollection,
  ownsCollection,
  serverWrote,
  setOwnVisibility
} from "../account/collections.ts";
import { account, isAdmin, loginHref, sessionReady } from "../account/session.ts";
import { trackEvent } from "../analytics/analytics.ts";
import { addAll, removeAll, roomNote, selected } from "../selection/selection.ts";
import { collectionHref } from "./address.ts";
import { changeCollection, deleteCollection, readState, saveCopy, syncCopy } from "./client.ts";
import { failedWrite } from "./collect.ts";
import styles from "./collections.module.css";
import { forgetCollection } from "./overlay.ts";
import type { Visibility } from "./schema.ts";
import type { CollectionDocument, CopyStanding } from "./types.ts";

/* The presses at the end of a collection's row: the selection's own, then every palette into the selection or out of
   it; Save (someone else's collection), Saved and Update while the source moved on; on the owner's saved copy Update
   or Reset; an admin's own made public or private; Delete. Reset and Delete ask twice: the first press arms them for
   four seconds. With no connection the presses that need the server keep their places, disabled. */

const ARM_MS = 4000;
const TURNED_MS = 1800;
/* a turn of who sees it that moved the collection: the page drawn anew at its new address says what the press did */
const [carried, carry] = createDone<{ slug: string; to: Visibility }>(TURNED_MS);

/** A press's name while it stands as itself: armed or at work, its own words name it. */
const unarmed = (armed: boolean, name: string) => (armed ? undefined : t(name));

export function Actions(props: {
  slug: string;
  doc: CollectionDocument;
  /** the palettes in the page's order and view, as the selection holds them */
  palettes: readonly Drawn[];
  owned: boolean;
  canDelete: boolean;
  /** the account's copy of this collection, or this collection as the account's copy */
  copy: CopyStanding | null;
  /** the page shows the list's summary while the collection is read */
  provisional: boolean;
  /** the selection's press, which stands before the others as it stands at the end of the lists' row */
  selection: Element;
  say: (message: string, error?: boolean) => void;
  /** a write answered with the collection as it now stands */
  onDoc: (doc: CollectionDocument) => void;
  onCopy: (copy: CopyStanding | null) => void;
  /** a write moved the collection: the page follows it */
  onMoved: (slug: string) => void;
  onDeleted: () => void;
  /** who sees it while a change is on its way, which the heading shows */
  onTurning: (visibility: Visibility | null) => void;
}) {
  const savedCopy = () =>
    props.copy && !props.owned && props.copy.source.slug === props.slug ? props.copy : null;
  const savedFrom = () =>
    props.copy && props.owned && props.copy.slug === props.slug ? props.copy : null;

  /* every palette into the selection, or out once all are in; a full selection lets its oldest go and says so */
  const allChosen = () => props.palettes.length > 0 && props.palettes.every(p => selected(p));
  const chooseAll = () => {
    if (allChosen()) return removeAll(props.palettes);
    const { dropped } = addAll(props.palettes);
    if (dropped) props.say(roomNote(dropped));
  };

  /* Save: the account's private copy, made once; signed out, the press leads to sign in and back. A copy made here is
     a step of the page's undo, taken back while it is unchanged since */
  const [saving, setSaving] = createSignal(false);
  const save = async () => {
    if (!account()) {
      if (sessionReady()) location.assign(localHref(loginHref()));
      return;
    }
    setSaving(true);
    props.say("");
    try {
      const answer = await saveCopy(props.slug);
      props.onCopy(answer.copy);
      serverWrote();
      /* a copy the account held already, saved in another tab, is not this press's to take back */
      if (!answer.made) return;
      trackEvent("copy_collection", { slug: props.slug, copy: answer.collection.slug });
      record(saveStep(answer.collection.slug, answer.collection.title));
    } catch (reason) {
      props.say(failedWrite(reason, msg("Couldn't save the collection.")), true);
    } finally {
      setSaving(false);
    }
  };
  const saveStep = (copySlug: string, title: string) => {
    let at = copySlug;
    return {
      undo: async () => {
        const standing = (await readState(props.slug)).copy;
        if (standing?.differs) throw new Error(t("{title} has changed, so it stays.", { title }));
        await deleteCollection(at);
        serverWrote();
        props.onCopy(null);
      },
      redo: async () => {
        const answer = await saveCopy(props.slug);
        at = answer.collection.slug;
        serverWrote();
        props.onCopy(answer.copy);
      },
      fail: (reason: unknown) => props.say(failedWrite(reason), true)
    };
  };

  /* Update brings the source's changes into the copy and keeps its own; Reset makes the copy the source again */
  const [syncing, setSyncing] = createSignal<"update" | "reset" | null>(null);
  const [synced, markSynced] = createDone<"update">(1800);
  const [resetArmed, setResetArmed] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  onSettled(() => () => clearTimeout(resetTimer));
  /* Reset waits for the server: a press armed before the connection dropped rests again */
  createEffect(offline, off => {
    if (!off) return;
    clearTimeout(resetTimer);
    setResetArmed(false);
  });
  const sync = async (mode: "update" | "reset") => {
    const held = props.copy;
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
    props.say("");
    try {
      const answer = await syncCopy(held.slug, mode);
      props.onCopy(answer.copy);
      if (answer.collection.slug === props.slug) props.onDoc(answer.collection);
      serverWrote();
      trackEvent(mode === "update" ? "update_collection" : "reset_collection", { slug: held.slug });
      if (mode === "update") markSynced("update");
    } catch (reason) {
      props.say(
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

  /* who sees it, an admin's: the press turns at once and says so a moment; quick presses keep one write on its way
     and end on the last; a failure turns it back. Each write may move the collection, so the next is sent where the
     last left it, and the page follows only once the presses end */
  const [turned, setTurned] = createSignal<Visibility | null>(null);
  const [changedTo, markChanged] = createDone<Visibility>(TURNED_MS);
  /* where the last turn left the collection, while the page is on its way there */
  const [left, setLeft] = createSignal<{ slug: string; visibility: Visibility } | null>(null);
  const visibility = () => turned() ?? left()?.visibility ?? props.doc.visibility;
  const marked = () => changedTo() ?? (carried()?.slug === props.slug ? carried()!.to : null);
  let wanted: Visibility | null = null;
  let writing = false;
  const turn = async () => {
    const next: Visibility = visibility() === "public" ? "private" : "public";
    setTurned(next);
    props.onTurning(next);
    markChanged(next);
    props.say("");
    wanted = next;
    if (writing) return;
    writing = true;
    let at = left()?.slug ?? props.doc.slug;
    let now = left()?.visibility ?? props.doc.visibility;
    try {
      while (wanted && wanted !== now) {
        const to: Visibility = wanted;
        /* the account's own turns in its copy; any other answers as the server holds it */
        const held = ownsCollection(at);
        const answer = held
          ? await setOwnVisibility(at, to)
          : await changeCollection(at, { visibility: to });
        if (!held) {
          serverWrote();
          props.onDoc(answer.collection);
        }
        at = answer.collection.slug;
        now = to;
        if (wanted === to) wanted = null;
      }
    } catch (reason) {
      props.say(failedWrite(reason), true);
    } finally {
      wanted = null;
      writing = false;
      setTurned(null);
      props.onTurning(null);
    }
    if (at === props.slug) return void setLeft(null);
    setLeft({ slug: at, visibility: now });
    const done = changedTo();
    if (done) carry({ slug: at, to: done });
    props.onMoved(at);
  };

  /* deleting asks twice */
  const [armed, setArmed] = createSignal(false);
  const [deleting, setDeleting] = createSignal(false);
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  onSettled(() => () => clearTimeout(armTimer));
  const remove = async () => {
    if (deleting()) return;
    if (!armed()) {
      setArmed(true);
      clearTimeout(armTimer);
      armTimer = setTimeout(() => setArmed(false), ARM_MS);
      return;
    }
    clearTimeout(armTimer);
    setArmed(false);
    setDeleting(true);
    props.say("");
    const slug = props.doc.slug;
    const here = location.href;
    try {
      if (ownsCollection(slug)) deleteOwnCollection(slug);
      else {
        await deleteCollection(slug);
        if (props.owned) serverWrote();
      }
      forgetCollection(slug);
      // an answer that arrives after the reader left leads nowhere
      if (location.href === here) props.onDeleted();
    } catch (reason) {
      props.say(failedWrite(reason, msg("Couldn't delete the collection.")), true);
    } finally {
      setDeleting(false);
    }
  };

  const updateName = () =>
    t(synced() ? msg("Updated") : syncing() ? msg("Updating…") : msg("Update"));
  const UpdatePress = () => (
    <Button
      icon
      size="lg"
      aria-label={updateName()}
      tip={t("Update")}
      disabled={!!syncing() || !!synced() || offline()}
      onClick={() => void sync("update")}
    >
      <Icon name={synced() ? "check" : "refresh"} size={15} />
    </Button>
  );

  return (
    <div class={styles.actions}>
      {props.selection}
      <Button
        icon
        size="lg"
        turns
        aria-pressed={allChosen()}
        aria-label={t(allChosen() ? msg("Remove all from selection") : msg("Add all to selection"))}
        tip={t(allChosen() ? msg("Remove all from selection") : msg("Add all to selection"))}
        disabled={!props.palettes.length}
        onClick={chooseAll}
      >
        <Icon name={allChosen() ? "check" : "plus"} size={15} />
      </Button>
      <Show when={!props.owned}>
        <Show
          when={savedCopy()}
          fallback={
            <Button
              icon
              size="lg"
              aria-label={t(saving() ? msg("Saving…") : msg("Save"))}
              tip={t("Save")}
              disabled={
                !props.doc.items.length || props.provisional || saving() || deleting() || offline()
              }
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
                <UpdatePress />
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
                aria-label={unarmed(resetArmed() || !!syncing(), msg("Reset"))}
                tip={t("Reset")}
                disabled={!held().differs || !!syncing() || offline()}
                onClick={() => void sync("reset")}
              >
                <Show when={resetArmed() || syncing()} fallback={<Icon name="reset" size={15} />}>
                  {t(syncing() ? msg("Resetting…") : msg("Press again to reset"))}
                </Show>
              </Button>
            }
          >
            <UpdatePress />
          </Show>
        )}
      </Show>
      <Show when={props.owned && isAdmin()}>
        <Button size="lg" onClick={() => void turn()}>
          <Show when={marked() === visibility()}>
            <Icon name="check" size={15} />{" "}
          </Show>
          {t(
            marked() === visibility()
              ? visibility() === "public"
                ? msg("Now public")
                : msg("Now private")
              : visibility() === "public"
                ? msg("Make private")
                : msg("Make public")
          )}
        </Button>
      </Show>
      <Show when={props.canDelete}>
        <Button
          size="lg"
          icon={!armed() && !deleting()}
          danger
          aria-label={unarmed(armed() || deleting(), msg("Delete collection"))}
          tip={t("Delete collection")}
          disabled={deleting() || (offline() && !ownsCollection(props.slug))}
          onClick={() => void remove()}
        >
          <Show when={armed() || deleting()} fallback={<Icon name="trash" size={15} />}>
            {t(deleting() ? msg("Deleting…") : msg("Press again to delete"))}
          </Show>
        </Button>
      </Show>
    </div>
  );
}
