import { dominantColors } from "@grabient/engine/dominant.ts";
import { localHref, t } from "@grabient/i18n";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { createEffect, createSignal, Errored, Loading, onCleanup, untrack } from "solid-js";
import { listUnavailable, marked, offline } from "../../app/connection.ts";
import list from "../../app/list.module.css";
import { failed } from "../../lib/query.ts";
import { paletteId } from "../../lib/words.ts";
import { account } from "../account/session.ts";
import { arrivedWhole, FIELD_MAX, readField, typedWords } from "../gallery/field.ts";
import { countSearch, tagPressed } from "../search/count.ts";
import { SearchField } from "../search/SearchField.tsx";
import { SearchTags } from "../search/SearchTags.tsx";
import { collectionHref, type PaletteOrder } from "./address.ts";
import { collectionGone } from "./overlay.ts";
import { type ListPlace, pageSearch } from "./params.ts";
import { ownQuery, tagsQuery } from "./queries.ts";
import type { CollectionSummary } from "./types.ts";

/* The search over a collections list: the field and the tags under it. Enter searches the collections for the words
   in the list's order; a public collection whose title is the words opens instead (on Saved, one of the account's
   own), and a search of the public lists counts for the Popular tags. A palette or a Grabient link pasted or dropped
   whole searches at once, and an emptied field lets go of the words. At rest the tags are the popular collections;
   while the field holds words, the collections whose titles answer them, asked once typing pauses; on Saved, the
   account's own that answer them. With no connection the public lists' field and the tags that need the server keep
   their places, disabled. */

const PAUSE = 150;
const OWN_PAUSE = 250;
const OWN_TAGS = 12;

/* what the search says to an agent in the browser (WebMCP's form annotations), in English as tools are named */
const TOOL = {
  name: "search_collections",
  description:
    "Search Grabient for collections of color palettes and gradients by title, subject or tag. Opens the results on this page. A palette link or seed finds the collections like that palette.",
  words: "Words such as ocean, retro or app background, or a Grabient palette link or seed."
};

export function Find(props: {
  place: ListPlace;
  /** the address that lists these words in the page's order and view; "" lets go of them */
  to: (words: string, view?: URLSearchParams) => string;
  /** why the field's text cannot be searched, for the page's line; "" once the reader types again */
  onError: (message: string) => void;
  onImage?: (file: File) => void;
}) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const mine = () => props.place.order === "saved";
  /* a collection opened from Rising opens with its palettes rising first */
  const openOrder = (): PaletteOrder => (props.place.order === "rising" ? "rising" : "popular");
  const openPath = (slug: string) =>
    collectionHref(slug, mine() ? "popular" : openOrder()) + pageSearch(props.place.view);
  const open = (slug: string) => localHref(openPath(slug));

  /* what the field holds: the address's words, until the reader types; what the tags answer, once typing pauses */
  const [typed, setTyped] = createSignal(() => props.place.query);
  const [asked, setAsked] = createSignal(() => props.place.query);
  let pause: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(pause));
  const ask = (text: string) => {
    clearTimeout(pause);
    pause = setTimeout(() => setAsked(typedWords(text)), mine() ? OWN_PAUSE : PAUSE);
  };

  const tags = useQuery(() => ({
    ...tagsQuery(mine() ? "" : asked()),
    placeholderData: keepPreviousData
  }));
  /* on Saved, words typed and not yet searched find the account's own, by their letters: a private read, fetched
     through the cache into the bar's own state once the account is known */
  const [ownHits, setOwnHits] = createSignal<{ words: string; items: CollectionSummary[] } | null>(
    null
  );
  createEffect(
    () => {
      const who = account()?.id;
      const words = asked();
      return mine() && who && words ? { who, words } : null;
    },
    wanted => {
      if (!wanted) return;
      let live = true;
      const key = { query: wanted.words, sort: "newest" as const, page: 1, limit: OWN_TAGS };
      untrack(() => client.fetchQuery(ownQuery(wanted.who, key, false))).then(
        page => {
          if (live && !failed(page)) setOwnHits({ words: wanted.words, items: page.items });
        },
        () => {}
      );
      return () => {
        live = false;
      };
    }
  );
  const ownTitled = () => {
    const hits = ownHits();
    return hits && hits.words === asked() ? hits.items : [];
  };
  const shown = () => {
    const own = mine() && !!typed().trim();
    const hits = own
      ? ownTitled().map(c => ({
          title: c.title,
          slug: c.slug,
          colors: dominantColors(c.preview.map(p => p.seed))
        }))
      : (tags.data ?? []);
    return marked(
      hits
        .filter(hit => !collectionGone(hit.slug))
        .map(hit => ({ label: hit.title, href: open(hit.slug), colors: hit.colors }))
    );
  };

  const submit = async (text: string, counted: boolean) => {
    if (!text.trim()) return;
    const read = readField(text);
    if ("error" in read) return props.onError(t(read.error));
    props.onError("");
    if ("open" in read) return void navigate({ href: read.open });
    const words = read.words;
    const lower = words.toLowerCase();
    if (!paletteId(words)) {
      if (counted && !mine()) countSearch(words, "collections");
      /* the collection whose title was typed out opens: on Saved one of the account's own */
      const at = location.href;
      const titled = mine()
        ? ownTitled()
        : await client.fetchQuery(tagsQuery(words)).catch(() => []);
      // the reader moved on while the title was looked up
      if (location.href !== at) return;
      const named = titled.find(c => c.title.toLowerCase() === lower);
      if (named) return void navigate({ href: openPath(named.slug) });
    }
    void navigate({ href: props.to(words, read.view) });
  };
  const input = (text: string) => {
    const before = typed();
    setTyped(text);
    props.onError("");
    if (!text.trim() && props.place.query) return void navigate({ href: props.to("") });
    if (arrivedWhole(text, before)) return void submit(text, false);
    ask(text);
  };

  return (
    <div class={list.find}>
      <SearchField
        value={typed()}
        placeholder={t("Search collections")}
        maxlength={FIELD_MAX}
        tool={TOOL}
        disabled={listUnavailable(props.place.order)}
        onInput={input}
        onSubmit={text => void submit(text, true)}
        onImage={props.onImage}
      />
      <Errored fallback={() => <SearchTags tags={[]} />}>
        <Loading fallback={<SearchTags tags={[]} loading={!offline()} />}>
          <SearchTags
            lead={typed().trim() ? undefined : t("Popular")}
            tags={shown()}
            onPick={(tag, index) => tagPressed(tag, index, "collections")}
          />
        </Loading>
      </Errored>
    </div>
  );
}
