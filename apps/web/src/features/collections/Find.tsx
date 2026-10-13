import { dominantColors } from "@grabient/engine/dominant.ts";
import { localHref, t } from "@grabient/i18n";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { createSignal, Errored, Loading, onCleanup } from "solid-js";
import { account } from "../account/session.ts";
import { countSearch } from "../search/count.ts";
import { SearchField } from "../search/SearchField.tsx";
import { SearchTags } from "../search/SearchTags.tsx";
import { collectionHref, type PaletteOrder } from "./address.ts";
import styles from "./collections.module.css";
import { arrivedWhole, FIELD_MAX, readField, typedWords } from "./field.ts";
import { followInPlace } from "./navigation.ts";
import { type ListPlace, type ListView, listSearch, listView, pageSearch } from "./params.ts";
import { failed, ownQuery, tagsQuery } from "./queries.ts";

/* The search over a collections list: the field and the tags under it. Enter searches the collections for the words
   in the list's order; a public collection whose title is the words opens instead (on Saved, one of the account's
   own), and a search of the public lists counts for the Popular tags. A palette or a Grabient link pasted or dropped
   whole searches at once, and an emptied field lets go of the words. At rest the tags are the popular collections;
   while the field holds words, the collections whose titles answer them, asked once typing pauses; on Saved, the
   account's own that answer them. */

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
  disabled?: boolean;
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
  /* on Saved, words typed and not yet searched find the account's own, by their letters */
  const own = useQuery(() => ({
    ...ownQuery(
      account()?.id ?? "",
      { query: asked(), sort: "newest", page: 1, limit: OWN_TAGS },
      false
    ),
    enabled: mine() && !!asked() && !!account(),
    placeholderData: keepPreviousData
  }));
  const shown = () => {
    if (mine() && typed().trim()) {
      const page = own.isSuccess ? own.data : undefined;
      return page && !failed(page)
        ? page.items.slice(0, OWN_TAGS).map(c => ({
            label: c.title,
            href: open(c.slug),
            colors: dominantColors(c.preview.map(p => p.seed))
          }))
        : [];
    }
    return (tags.data ?? []).map(hit => ({
      label: hit.title,
      href: open(hit.slug),
      colors: hit.colors
    }));
  };

  const submit = async (text: string, counted: boolean) => {
    if (!text.trim()) return;
    const read = readField(text);
    if ("error" in read) return props.onError(t(read.error));
    props.onError("");
    if ("open" in read) return void navigate({ href: read.open });
    const words = read.words;
    const lower = words.toLowerCase();
    if (!read.palette) {
      if (counted && !mine()) countSearch(words, "collections");
      /* the collection whose title was typed out opens: on Saved one of the account's own */
      const at = location.href;
      const titled = mine()
        ? own.isSuccess && own.data && !failed(own.data)
          ? own.data.items
          : []
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
    <div class={styles.find}>
      <SearchField
        value={typed()}
        placeholder={t("Search collections")}
        maxlength={FIELD_MAX}
        tool={TOOL}
        disabled={props.disabled}
        onInput={input}
        onSubmit={text => void submit(text, true)}
        onImage={mine() ? undefined : props.onImage}
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: the tags are links, which
          the keyboard follows; this only keeps a plain press in the page */}
      <div onClick={e => followInPlace(e, href => void navigate({ href }))}>
        <Errored fallback={() => <SearchTags tags={[]} />}>
          <Loading fallback={<SearchTags tags={[]} loading />}>
            <SearchTags lead={typed().trim() ? undefined : t("Popular")} tags={shown()} />
          </Loading>
        </Errored>
      </div>
    </div>
  );
}

/** The page's view, with a pasted link's wherever the page says none of its own. */
export function viewWith(view: ListView, link?: URLSearchParams): ListView {
  if (!link) return view;
  const params = new URLSearchParams(listSearch({ view }).slice(1));
  for (const [key, value] of link) if (!params.has(key)) params.set(key, value);
  return listView(params);
}
