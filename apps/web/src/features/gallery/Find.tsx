import { delocalizePath, localHref, t } from "@grabient/i18n";
import { keepPreviousData, useQuery } from "@tanstack/solid-query";
import { useNavigate } from "@tanstack/solid-router";
import { createSignal, Errored, Loading, onCleanup } from "solid-js";
import type * as v from "valibot";
import { paletteId } from "../../lib/words.ts";
import type { SearchPage, SearchSuggestions } from "../search/bodies.ts";
import { countSearch } from "../search/count.ts";
import { suggestionsQuery } from "../search/queries.ts";
import { SearchField } from "../search/SearchField.tsx";
import { SearchTags } from "../search/SearchTags.tsx";
import { inPlace } from "./feed.ts";
import { arrivedWhole, FIELD_MAX, readField, typedWords } from "./field.ts";
import styles from "./gallery.module.css";
import { own } from "./queries.ts";

/* The search over a gallery list: the field, and the tags under it. Enter searches the words on the page the reader
   is on; a palette or a Grabient link pasted or dropped whole searches at once; an emptied field lets go of the words.
   At rest the tags are the popular searches (on the home, searches and collections in turn); while the field holds
   words, the searches that answer them, asked once typing pauses, the last answer standing until the next lands. */

/** How long typing pauses before the tags are asked for what it typed. */
const PAUSE = 150;
const AT_REST = 24;
const TYPED = 12;

/** The tags a page shows for its words: what its loader reads ahead, so they are in the page from its first paint. */
export const tagsQuery = (words: string, home: boolean) =>
  suggestionsQuery(words, words ? { limit: TYPED } : { both: home, limit: AT_REST });

type Tags = v.InferOutput<typeof SearchSuggestions>["suggestions"];
/* the row's read: the last answer stands until the next lands, and the row draws its own copy (queries.ts) */
const tagsView = (words: string, home: boolean) => ({
  ...tagsQuery(words, home),
  placeholderData: keepPreviousData,
  select: (tags: Tags) => own(tags)
});

/** What a page's search says to an agent in the browser (WebMCP's form annotations), in English as tools are named. */
export interface FieldTool {
  name: string;
  description: string;
  words: string;
}

export function Find(props: {
  surface: Extract<SearchPage, "home" | "palettes">;
  /** the words the address holds */
  words: string;
  placeholder: string;
  tool: FieldTool;
  /** the address that searches these words on this page, in the view a pasted link draws in; "" lets go of them */
  to: (words: string, view?: URLSearchParams) => string;
  /** Enter counts the words for the tags (never on Saved, never a palette) */
  counts: boolean;
  /** why the field's text cannot be searched, for the page's line; "" once the reader types again */
  onError: (message: string) => void;
  onImage?: (file: File) => void;
}) {
  const navigate = useNavigate();
  const home = () => props.surface === "home";
  /* what the field holds: the address's words, until the reader types */
  const [typed, setTyped] = createSignal(() => props.words);
  /* what the tags answer: the address's words, until typing pauses */
  const [asked, setAsked] = createSignal(() => props.words);
  let pause: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(pause));
  const ask = (text: string) => {
    clearTimeout(pause);
    pause = setTimeout(() => setAsked(typedWords(text)), PAUSE);
  };
  const tags = useQuery(() => tagsView(asked(), home()));
  const shown = () =>
    (tags.data ?? []).map(tag => ({
      label: tag.label,
      colors: tag.colors,
      href: localHref(tag.query ? props.to(tag.query) : tag.href)
    }));

  const go = (words: string, view?: URLSearchParams) =>
    void navigate({ href: props.to(words, view) });
  const submit = (text: string, counted: boolean) => {
    const read = readField(text);
    if ("error" in read) return props.onError(t(read.error));
    props.onError("");
    if ("open" in read) return void navigate({ href: read.open });
    if (counted && props.counts && !paletteId(read.words)) countSearch(read.words, props.surface);
    go(read.words, read.view);
  };
  const input = (text: string) => {
    const before = typed();
    setTyped(text);
    props.onError("");
    if (!text.trim() && props.words) return go("");
    if (arrivedWhole(text, before)) return submit(text, false);
    ask(text);
  };
  /* a tag is a link, for a new tab and for readers without scripts; a plain press swaps the page in place */
  const follow = (e: MouseEvent) => {
    const link = (e.target as Element).closest("a[href]");
    if (!link) return;
    const url = new URL(link.getAttribute("href") ?? "", location.href);
    inPlace(e, () => void navigate({ href: delocalizePath(url.pathname).path + url.search }));
  };

  return (
    <div class={styles.find}>
      <SearchField
        value={typed()}
        placeholder={props.placeholder}
        maxlength={FIELD_MAX}
        tool={props.tool}
        onInput={input}
        onSubmit={text => submit(text, true)}
        onImage={props.onImage}
      />
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: the tags are links, which
          the keyboard follows; this only keeps a plain press in the page */}
      <div onClick={follow}>
        {/* a row that cannot be read keeps its room and offers nothing: the field still searches */}
        <Errored fallback={() => <SearchTags tags={[]} />}>
          <Loading fallback={<SearchTags tags={[]} loading />}>
            <SearchTags lead={typed().trim() ? undefined : t("Popular")} tags={shown()} />
          </Loading>
        </Errored>
      </div>
    </div>
  );
}
