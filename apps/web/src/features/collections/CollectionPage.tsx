import { decodePalette } from "@grabient/engine";
import { localHref, msg, rich, t } from "@grabient/i18n";
import { Button } from "@grabient/ui/Button.tsx";
import { CollectPress } from "@grabient/ui/CollectPress.tsx";
import { Curation } from "@grabient/ui/Curation.tsx";
import { Fit, type FitVote } from "@grabient/ui/Fit.tsx";
import { Icon } from "@grabient/ui/Icon.tsx";
import { PaletteCard } from "@grabient/ui/PaletteCard.tsx";
import { PaletteGrid } from "@grabient/ui/PaletteGrid.tsx";
import { PaletteCardPlaceholder } from "@grabient/ui/PalettePlaceholder.tsx";
import { Placeholder } from "@grabient/ui/Placeholder.tsx";
import { RemovePress, UndoPress } from "@grabient/ui/RemovePress.tsx";
import { Segmented } from "@grabient/ui/Segmented.tsx";
import { Status } from "@grabient/ui/Status.tsx";
import { Text } from "@grabient/ui/Text.tsx";
import { useQuery, useQueryClient } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { createEffect, createMemo, createSignal, For, onSettled, Show, untrack } from "solid-js";
import { isNextUndo, record, type Step, undo } from "../../app/undo.ts";
import {
  type OwnedDoc,
  ownCollectionDoc,
  ownCollectionMoved,
  ownsCollection,
  removeOwnPalette,
  restoreOwnPalette,
  serverWrote
} from "../account/collections.ts";
import { likeCount, liked, noteCounts, toggleLike } from "../account/likes.ts";
import { account, isAdmin, loginHref, sessionReady } from "../account/session.ts";
import { selected, toggle } from "../selection/selection.ts";
import { Actions } from "./Actions.tsx";
import { collectionHref, type PaletteOrder, sortCollectionItems } from "./address.ts";
import {
  castVote,
  changeCollection,
  deletePalette,
  inputOf,
  keyOf,
  removePalette,
  restorePalette,
  setPaletteView
} from "./client.ts";
import { createChecklists, failedWrite } from "./collect.ts";
import styles from "./collections.module.css";
import { createDeletable } from "./deletable.ts";
import { drawnAs, hexesOf, minuteOf, nameOf, paletteHref, relativeAge } from "./drawing.ts";
import { Heading } from "./Heading.tsx";
import { Notes } from "./Notes.tsx";
import { followInPlace } from "./navigation.ts";
import { forgetPalette, paletteGone } from "./overlay.ts";
import { type ListView, listSearch, pageSearch } from "./params.ts";
import { collectionQuery, failed, stateQuery } from "./queries.ts";
import type { Visibility } from "./schema.ts";
import type { CollectionDocument, CollectionItem, CopyStanding } from "./types.ts";

/* One collection's page, at /{slug} and /{slug}/rising, or under its owner at /@{handle}/{slug}; its route draws a new
   one for each collection, so nothing of one collection's page stands on the next. The server draws a public
   collection whole; a private one is its owner's alone, so the server answers 404 naming it private, and the owner's
   browser fills it in from the account's copy or its own read. Once the reader is known, one read says what else they
   may do here: save a copy or bring one up to date, vote on each palette's fit, change their own (its words, who sees
   it, its palettes), and for an admin curate Grabient's and leave the agents notes. */

/* a palette taken out stands faded, with Undo over it, this long before it leaves the grid; a mouse resting on it or
   the keyboard in it holds it, checked again each second */
const REMOVED_STAYS_MS = 6000;
const HOLD_MS = 1000;
const PLACEHOLDERS_MAX = 24;
const ORDERS: readonly { value: PaletteOrder; label: string }[] = [
  { value: "popular", label: msg("Popular", "order") },
  { value: "rising", label: msg("Rising", "order") }
];

interface Removal {
  item: CollectionItem;
  token: string | null;
  /** the step of the page's undo that took it out */
  step: Step;
}

export function CollectionPage(props: { slug: string; order: PaletteOrder; view: ListView }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const found = useQuery(() => collectionQuery(props.slug));
  const [note, setNote] = createSignal("");
  const [error, setError] = createSignal(false);
  const say = (message: string, isError = false) => {
    setNote(message);
    setError(isError);
  };
  /* a query's data is read once it has answered: an unanswered one has no value to read outside a Loading boundary */
  const answer = () => (found.isSuccess ? found.data : undefined);
  const data = () => {
    const read = answer();
    return read && !failed(read) ? read : null;
  };
  const readFailed = () => {
    const read = answer();
    return failed(read) ? read.failed : "";
  };

  /* what the account may do here, read once the reader is known */
  const viewer = useQuery(() => ({
    ...stateQuery(account()?.id ?? "", props.slug),
    enabled: !!account()
  }));
  const state = () => (account() && viewer.isSuccess ? (viewer.data ?? null) : null);
  /* the account's own collection, from its copy where the copy holds it */
  const fromCopy = useQuery(() => ({
    queryKey: ["own-collection", account()?.id ?? "", props.slug] as const,
    queryFn: async () => (await ownCollectionDoc(props.slug)) ?? null,
    enabled: !!account(),
    staleTime: 0
  }));
  const copied = (): OwnedDoc | undefined =>
    account() && fromCopy.isSuccess ? (fromCopy.data ?? undefined) : undefined;
  /* every write's answer, newer than any read */
  const [own, setOwn] = createSignal<CollectionDocument | null>(null);
  const doc = (): CollectionDocument | null =>
    own() ?? copied() ?? state()?.collection ?? data()?.doc ?? null;
  const owned = () => !!copied() || !!state()?.owned;
  const curating = () => !!state()?.canCurate && isAdmin();
  const provisional = () => !own() && !copied() && !state()?.collection && !!data()?.provisional;
  /* the minute the page's data was read: the clock its ages are told against, the same for the server and hydration */
  const now = () => minuteOf(data()?.fetchedAt ?? Date.now());

  /* a collection the server moved (a new title, who sees it, a new username) is followed to its new address */
  const follow = (slug: string) => {
    if (slug !== props.slug)
      void navigate({
        href: collectionHref(slug, props.order) + pageSearch(props.view),
        replace: true
      });
  };
  createEffect(
    () => {
      const moved = account() ? ownCollectionMoved(props.slug) : null;
      return moved && moved !== props.slug
        ? collectionHref(moved, props.order) + pageSearch(props.view)
        : null;
    },
    href => {
      if (href) void navigate({ href, replace: true });
    }
  );
  /* the counts beside the hearts start as the page read them */
  createEffect(
    () => data(),
    read => {
      if (read?.doc)
        noteCounts(
          read.doc.items.map(item => ({ seed: item.kseed, likes: item.likes })),
          read.fetchedAt
        );
    }
  );
  /* the tab says the collection once the owner's read brings one the server could not draw */
  createEffect(
    () => (data()?.doc ? null : doc()?.title),
    title => {
      if (title) document.title = `${title} | Grabient`;
    }
  );

  /* the copy standing: the account's copy of this one, or this one as the account's copy */
  const [copy, setCopy] = createSignal<CopyStanding | null | undefined>(undefined);
  const standing = () => (copy() === undefined ? (state()?.copy ?? null) : copy()!);
  const savedFrom = () => {
    const held = standing();
    return held && owned() && held.slug === props.slug ? held : null;
  };

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
    const later = (after: number) =>
      leaving.set(
        key,
        setTimeout(() => {
          const card = document.querySelector(`[data-item="${CSS.escape(key)}"]`);
          const rested =
            !!card &&
            ((!matchMedia("(pointer: coarse)").matches && card.matches(":hover")) ||
              !!card.querySelector(":focus-visible"));
          if (rested) later(HOLD_MS);
          else showRemoved(key, null);
        }, after)
      );
    later(REMOVED_STAYS_MS);
  };
  /* the palettes in the order the address says, by the likes the page was sent, so a like moves a count, never a card */
  const shown = createMemo(() => {
    const items = (doc()?.items ?? []).filter(item => !paletteGone(item.kseed));
    const held = new Set(items.map(keyOf));
    const gone = [...removals().values()].map(r => r.item).filter(item => !held.has(keyOf(item)));
    return sortCollectionItems([...items, ...gone], props.order);
  });
  const removedKey = (item: CollectionItem) => {
    const key = keyOf(item);
    return removals().has(key) && !doc()?.items.some(i => keyOf(i) === key) ? key : null;
  };
  const draw = (item: CollectionItem) => drawnAs(inputOf(item), props.view);
  const palettes = createMemo(() => (doc()?.items ?? []).map(draw));

  /* the owner takes a palette out: through the account's copy where it holds the collection, else the server. The
     removal is a step of the page's undo, and its token puts the palette back where it stood */
  const [busyItem, setBusyItem] = createSignal("");
  const removeFrom = async (slug: string, item: CollectionItem) => {
    const answer = ownsCollection(slug)
      ? removeOwnPalette(slug, item.kseed, {
          style: item.style,
          steps: item.steps,
          angle: item.angle
        })
      : await removePalette(slug, inputOf(item));
    if (!ownsCollection(slug)) serverWrote();
    setOwn(answer.collection);
    return answer.restore ?? null;
  };
  const restoreTo = async (slug: string, item: CollectionItem, token: string) => {
    const answer = ownsCollection(slug)
      ? restoreOwnPalette(slug, item.kseed, token)
      : await restorePalette(slug, item.kseed, token);
    if (!ownsCollection(slug)) serverWrote();
    setOwn(answer.collection);
  };
  const takeOut = async (item: CollectionItem) => {
    const current = doc();
    if (!current || busyItem()) return;
    const key = keyOf(item);
    setBusyItem(key);
    say("");
    try {
      const slug = current.slug;
      let token = await removeFrom(slug, item);
      const step: Step = {
        undo: async () => {
          if (!token) throw new Error(t("This palette can't be put back."));
          await restoreTo(slug, item, token);
          showRemoved(key, null);
          say(t("Palette put back."));
        },
        redo: async () => {
          token = await removeFrom(slug, item);
          showRemoved(key, { item, token, step });
          say(t("Palette removed."));
        },
        fail: reason => say(failedWrite(reason, msg("Couldn't put the palette back.")), true)
      };
      showRemoved(key, { item, token, step });
      record(step);
      say(t("Palette removed."));
    } catch (reason) {
      say(failedWrite(reason, msg("Couldn't remove the palette.")), true);
      throw reason;
    } finally {
      setBusyItem("");
    }
  };
  /* Undo on a faded card: the page's own undo while its removal is the last step, so Mod+Shift+Z takes it out again;
     else it puts the palette back as a step of its own */
  const putBack = async (key: string) => {
    const removal = removals().get(key);
    const current = doc();
    if (!removal || !current) return;
    if (isNextUndo(removal.step)) return undo();
    setBusyItem(key);
    say("");
    try {
      if (!removal.token) throw new Error(t("This palette can't be put back."));
      const slug = current.slug;
      await restoreTo(slug, removal.item, removal.token);
      showRemoved(key, null);
      say(t("Palette put back."));
      let token: string | null = null;
      record({
        undo: async () => {
          token = await removeFrom(slug, removal.item);
          showRemoved(key, { ...removal, token });
        },
        redo: async () => {
          if (token) await restoreTo(slug, removal.item, token);
          showRemoved(key, null);
        },
        fail: reason => say(failedWrite(reason), true)
      });
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
    forgetPalette(item.kseed);
    const items = current.items.filter(entry => entry.kseed !== item.kseed);
    setOwn({ ...current, items, itemCount: items.length, updatedAt: Date.now() });
    void client.invalidateQueries({ queryKey: ["collections"] });
    say(t("Palette deleted."));
  };

  /* the reader's fit votes: a press shows at once, one write per palette at a time, the last press winning; a failure
     puts the vote back */
  const [pressed, setPressed] = createSignal<Readonly<Record<string, FitVote | null>>>({});
  const voteOf = (seed: string): FitVote | null => {
    const mine = pressed();
    return seed in mine ? (mine[seed] ?? null) : (state()?.votes[seed] ?? null);
  };
  const showVote = (seed: string, to: FitVote | null) =>
    setPressed(all => ({ ...all, [seed]: to }));
  const waiting = new Map<string, FitVote | null>();
  const vote = async (item: CollectionItem, next: FitVote | null) => {
    const current = doc();
    if (!current) return;
    if (!account()) {
      if (sessionReady()) location.assign(localHref(loginHref()));
      return;
    }
    const seed = item.kseed;
    const sending = waiting.has(seed);
    let before = voteOf(seed);
    showVote(seed, next);
    waiting.set(seed, next);
    if (sending) return;
    try {
      while (waiting.has(seed)) {
        const asked = waiting.get(seed) ?? null;
        await castVote(current.slug, seed, asked);
        before = asked;
        if (waiting.get(seed) === asked) waiting.delete(seed);
      }
    } catch (reason) {
      waiting.delete(seed);
      showVote(seed, before);
      say(failedWrite(reason, msg("Couldn't save your vote.")), true);
    }
  };

  const checklists = createChecklists(say);
  const [turning, setTurning] = createSignal<Visibility | null>(null);
  const tags = () =>
    (doc()?.tags ?? []).map(tag => ({
      label: tag,
      href: localHref(
        `/collections${props.order === "rising" ? "/rising" : ""}${listSearch({ query: tag, view: props.view })}`
      )
    }));
  const pageHref = (order: PaletteOrder) =>
    localHref(collectionHref(props.slug, order) + pageSearch(props.view));
  /* a private collection's words for a reader not signed in: the way to sign in as its owner */
  const privateHere = () => !doc() && !!data()?.private && !account();
  const missing = () => !doc() && !!data() && !privateHere();
  const empty = () => !!doc() && !provisional() && !doc()!.items.length;
  const waitingFor = () => {
    const drawn = shown().length;
    const count = doc()?.itemCount;
    return Math.max(0, Math.min(count ?? 6, PLACEHOLDERS_MAX) - drawn);
  };

  return (
    <main id="main" class={styles.page}>
      <div class={styles.band}>
        <div class={styles.back}>
          <Button
            size="sm"
            href={localHref(
              (props.order === "rising" ? "/collections/rising" : "/collections") +
                listSearch({ view: props.view })
            )}
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
          <Show when={data() || readFailed()}>
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
                            href={localHref(loginHref(collectionHref(props.slug, props.order)))}
                          >
                            {words}
                          </a>
                        )
                      })
                    : t("It may have been deleted.")}
                </Text>
              </Show>
            </div>
          </Show>
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
              <Actions
                slug={props.slug}
                doc={current()}
                palettes={palettes()}
                owned={owned()}
                canDelete={!!copied() || !!state()?.canDelete}
                copy={standing()}
                provisional={provisional()}
                say={say}
                onDoc={setOwn}
                onCopy={setCopy}
                onMoved={follow}
                onTurning={setTurning}
                onDeleted={() =>
                  void navigate({ href: owned() ? "/collections/saved" : "/collections" })
                }
              />
            </div>
            <Heading
              doc={current()}
              visibility={turning() ?? current().visibility}
              savedFrom={savedFrom()}
              now={now()}
              admin={isAdmin()}
              editable={owned() && current().owner.kind === "user"}
              onWords={async words => {
                const answer = await changeCollection(current().slug, words);
                serverWrote();
                setOwn(answer.collection);
                follow(answer.collection.slug);
              }}
            />
            {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: the cards' presses
                are links and buttons the keyboard reaches; this only keeps a plain press of Edit in the page */}
            <div onClick={e => followInPlace(e, href => void navigate({ href }))}>
              <PaletteGrid>
                <For each={shown()} keyed={item => keyOf(item)}>
                  {item => {
                    const palette = createMemo(() => draw(item()));
                    const stops = createMemo(() => hexesOf(palette().seed, palette().steps));
                    const collect = checklists.card(() => inputOf(item()));
                    const gone = () => removedKey(item());
                    const seed = () => item().kseed;
                    return (
                      <div class={styles.cell} data-item={keyOf(item())}>
                        <PaletteCard
                          seed={seed()}
                          name={nameOf(palette())}
                          stops={stops()}
                          style={palette().style}
                          angle={palette().angle}
                          href={paletteHref(palette(), props.view.size)}
                          age={relativeAge(item().createdAt, now())}
                          likes={likeCount(seed(), item().likes)}
                          liked={liked(seed())}
                          onLike={() =>
                            void toggleLike(seed(), !liked(seed()), {
                              collectionId: current().slug
                            })
                          }
                          selected={selected(palette())}
                          onSelect={() => toggle(palette())}
                          removed={!!gone()}
                          collect={<CollectPress collect={collect} />}
                          fit={
                            <Fit
                              value={voteOf(seed())}
                              admin={curating()}
                              collection={current().title}
                              onVote={next => void vote(item(), next)}
                            />
                          }
                          lead={
                            <Show
                              when={!gone()}
                              fallback={
                                <UndoPress
                                  onUndo={() => putBack(gone()!)}
                                  disabled={!!busyItem()}
                                />
                              }
                            >
                              <Show when={owned() && current().owner.kind === "user"}>
                                <RemovePress
                                  item={keyOf(item())}
                                  onRemove={() => takeOut(item())}
                                  disabled={!!busyItem()}
                                />
                              </Show>
                              <Show when={curating() && deletable.of(seed()) !== undefined}>
                                <Curation
                                  mode="view"
                                  icon="sliders"
                                  blocked={deletable.of(seed()) ? undefined : t("Liked by someone")}
                                  stops={hexesOf(seed(), item().steps)}
                                  view={inputOf(item())}
                                  stopsAt={steps => hexesOf(seed(), steps)}
                                  minSteps={decodePalette(seed())?.anchors.length}
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
                                  blocked={deletable.of(seed()) ? undefined : t("Liked by someone")}
                                  stops={hexesOf(seed(), item().steps)}
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
                <For each={Array.from({ length: provisional() ? waitingFor() : 0 }, (_, i) => i)}>
                  {() => (
                    <div class={styles.cell}>
                      <PaletteCardPlaceholder />
                    </div>
                  )}
                </For>
              </PaletteGrid>
            </div>
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
        {notes => <Notes slug={untrack(() => props.slug)} notes={notes()} now={now()} />}
      </Show>
    </main>
  );
}
